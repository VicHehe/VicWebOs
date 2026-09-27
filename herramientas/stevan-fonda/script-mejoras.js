// ============================================================
//  Stevan Fonda — UI: mejoras, productos, hitos, prestigio
//  Se carga ÚLTIMO (después de script.js y script-clientes.js).
// ============================================================

'use strict';

let toastTimeout = null;

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('sfToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'sf-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HUD
// ============================================================
function formatearNumero(n) {
    n = Math.floor(Number(n) || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 100000)  return Math.floor(n / 1000) + 'k';
    if (n >= 10000)   return (n / 1000).toFixed(1).replace('.', ',') + 'k';
    return n.toString();
}

function actualizarHUD() {
    const estado = window.__sfEstado?.();
    if (!estado) return;

    const m = document.getElementById('sfMonedas');
    if (m) m.textContent = formatearNumero(estado.monedasFonda);

    const v = document.getElementById('sfTotalVendidos');
    if (v) v.textContent = formatearNumero(estado.totalVendidos);

    const e = document.getElementById('sfEstrellas');
    if (e) e.textContent = estado.estrellas;

    const p = document.getElementById('sfProduccion');
    if (p) p.textContent = calcularProduccionMostrar();
}

function calcularProduccionMostrar() {
    const estado = window.__sfEstado?.();
    const prods = window.__sfProductos || [];
    if (!estado) return '0';

    const mesas = estado.upgrades.mesas;
    const vel = (1 + (estado.upgrades.velocidad - 1) * 0.1)
              * (1 + (estado.upgrades.empleados - 1) * 0.05);
    const cookSeg = 30 / vel;
    const activos = prods.filter(p => estado.productosDesbloqueados.includes(p.id));
    if (!activos.length) return '0';

    const prom = activos.reduce((a, p) =>
        a + p.precioBase
            * (1 + (estado.upgrades.precio - 1) * 0.15)
            * (1 + estado.upgrades.decoracion * 0.05)
            * (1 + estado.estrellas * 0.1), 0) / activos.length;

    const porSeg = (mesas / cookSeg) * prom;
    return porSeg >= 10 ? formatearNumero(Math.round(porSeg)) : (Math.round(porSeg * 10) / 10).toString();
}

// ============================================================
//  PRODUCTOS
// ============================================================
function renderProductos() {
    const grid = document.getElementById('sfProductosGrid');
    const info = document.getElementById('sfProductosInfo');
    const estado = window.__sfEstado?.();
    const prods = window.__sfProductos || [];
    if (!grid || !estado) return;

    grid.innerHTML = prods.map(p => {
        const activo = estado.productosDesbloqueados.includes(p.id);
        const iconoFinal = activo ? p.icono : 'lock';
        const precio = activo ? (window.__sfPrecioProducto?.(p) ?? p.precioBase) : null;

        return `
            <div class="sf-prod ${activo ? '' : 'bloqueado'}" title="${p.nombre}">
                <div class="sf-prod-icono"><i data-lucide="${iconoFinal}"></i></div>
                <div class="sf-prod-nombre">${p.nombre}</div>
                <div class="sf-prod-precio">
                    ${activo
                        ? `<i data-lucide="coins"></i>${precio}`
                        : `<i data-lucide="lock"></i>${p.desbloqueo}`}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    if (info) info.textContent = `${estado.productosDesbloqueados.length}/${prods.length}`;
}

function checkDesbloqueos() {
    const estado = window.__sfEstado?.();
    const prods = window.__sfProductos || [];
    if (!estado) return;

    const nuevos = [];
    for (const p of prods) {
        if (!estado.productosDesbloqueados.includes(p.id) && estado.totalVendidos >= p.desbloqueo) {
            estado.productosDesbloqueados.push(p.id);
            nuevos.push(p);
        }
    }
    if (nuevos.length === 0) return;

    // Mostrar el último en modal, el resto por toast
    if (nuevos.length === 1) {
        mostrarModalUnlock(nuevos[0]);
    } else {
        mostrarModalUnlock(nuevos[nuevos.length - 1]);
        nuevos.slice(0, -1).forEach(p => toast(`¡Desbloqueado: ${p.nombre}!`, 'success'));
    }

    renderProductos();
    window.__sfGuardarDebounce?.();
}

// ============================================================
//  MEJORAS
// ============================================================
function costoMejora(up) {
    const estado = window.__sfEstado?.();
    if (!estado) return Infinity;
    const nivel = estado.upgrades[up.id] || 1;
    const factor = up.id === 'decoracion'
        ? Math.pow(up.factor, nivel)
        : Math.pow(up.factor, nivel - 1);
    return Math.round(up.base * factor);
}

function renderMejoras() {
    const grid = document.getElementById('sfMejorasGrid');
    const estado = window.__sfEstado?.();
    const ups = window.__sfMejoras || [];
    if (!grid || !estado) return;

    grid.innerHTML = ups.map(up => {
        const nivel = estado.upgrades[up.id] || 0;
        const costo = costoMejora(up);
        const puede = estado.monedasFonda >= costo;
        return `
            <div class="sf-up">
                <div class="sf-up-icono"><i data-lucide="${up.icono}"></i></div>
                <div class="sf-up-info">
                    <div class="sf-up-cabecera">
                        <span class="sf-up-nombre">${up.nombre}</span>
                        <span class="sf-up-nivel">Nv ${nivel}</span>
                    </div>
                    <div class="sf-up-desc">${up.desc}</div>
                </div>
                <button class="sf-up-btn" data-up="${up.id}" ${puede ? '' : 'disabled'}>
                    <i data-lucide="coins"></i>${formatearNumero(costo)}
                </button>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    grid.querySelectorAll('.sf-up-btn').forEach(btn => {
        btn.addEventListener('click', () => comprarMejora(btn.dataset.up));
    });

    // Prestigio
    const btnP  = document.getElementById('btnPrestigio');
    const infoP = document.getElementById('sfPrestigioInfo');
    if (btnP && infoP) {
        const costo = window.__sfCOSTO_PRESTIGIO || 50000;
        const puede = estado.monedasFonda >= costo;
        btnP.disabled = !puede;

        if (estado.estrellas > 0) {
            infoP.textContent = `Tenés ${estado.estrellas} estrella${estado.estrellas === 1 ? '' : 's'} · +${estado.estrellas * 10}% de producción permanente`;
        } else if (!puede) {
            infoP.textContent = `Necesitás ${formatearNumero(costo)} monedas de fonda para reabrir`;
        } else {
            const st = Math.floor(estado.monedasFonda / costo);
            infoP.textContent = `¡Listo para reabrir! Te llevarás +${st} estrella${st === 1 ? '' : 's'}`;
        }
    }
}

function comprarMejora(id) {
    const up = (window.__sfMejoras || []).find(u => u.id === id);
    if (!up) return;
    const estado = window.__sfEstado?.();
    if (!estado) return;

    const costo = costoMejora(up);
    if (estado.monedasFonda < costo) {
        toast('No te alcanzan las monedas', 'error');
        return;
    }
    estado.monedasFonda -= costo;
    estado.upgrades[id] = (estado.upgrades[id] || 0) + 1;

    renderMejoras();
    renderProductos();
    window.__sfGuardarDebounce?.();
    toast(`${up.nombre} subió a nivel ${estado.upgrades[id]}`, 'success');
}

// ============================================================
//  HITOS (monedas reales VicWebOs)
// ============================================================
const HITOS = [
    { id: 'h100',    tipo: 'vendidos',  req: 100,  monedas: 5,   texto: 'Vender 100 productos' },
    { id: 'h500',    tipo: 'vendidos',  req: 500,  monedas: 15,  texto: 'Vender 500 productos' },
    { id: 'h1000',   tipo: 'vendidos',  req: 1000, monedas: 30,  texto: 'Vender 1.000 productos' },
    { id: 'h5prod',  tipo: 'productos', req: 5,    monedas: 10,  texto: 'Desbloquear 5 productos' },
    { id: 'h10prod', tipo: 'productos', req: 10,   monedas: 20,  texto: 'Desbloquear 10 productos' },
    { id: 'h14prod', tipo: 'productos', req: 14,   monedas: 100, texto: 'Completar el menú' }
];

async function checkHitos() {
    const estado = window.__sfEstado?.();
    if (!estado) return;

    for (const h of HITOS) {
        if (estado.hitosCompletados.includes(h.id)) continue;
        const valor = h.tipo === 'vendidos' ? estado.totalVendidos : estado.productosDesbloqueados.length;
        if (valor >= h.req) {
            estado.hitosCompletados.push(h.id);
            await otorgarMonedas(h.monedas, h.texto);
        }
    }
}

async function otorgarMonedas(cantidad, descripcion) {
    const api = window.parent.__vicwebos;
    if (!api) return;
    try {
        await api.canjear('chef-hat', 'stevan-fonda', descripcion, cantidad);
        toast(`¡+${cantidad} monedas! ${descripcion}`, 'success');
    } catch (e) {
        console.warn('[Stevan Fonda] No se pudo otorgar:', e);
    }
}

// ============================================================
//  MODALES
// ============================================================
function mostrarOffline(cantidad) {
    const modal = document.getElementById('sfModalOffline');
    const cant  = document.getElementById('sfOfflineCantidad');
    if (!modal || !cant) return;
    cant.textContent = '+' + formatearNumero(cantidad);
    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

function mostrarModalUnlock(prod) {
    const modal = document.getElementById('sfModalUnlock');
    const desc  = document.getElementById('sfUnlockDesc');
    const item  = document.getElementById('sfUnlockItem');
    if (!modal || !item) return;

    if (desc) desc.textContent = '¡Desbloqueaste un plato nuevo para tu fonda!';
    item.innerHTML = `
        <i data-lucide="${prod.icono}"></i>
        <span>${prod.nombre}</span>
    `;
    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

function mostrarModalPrestigio() {
    const modal = document.getElementById('sfModalPrestigio');
    if (!modal) return;
    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  PRESTIGIO
// ============================================================
function hacerPrestigio() {
    const estado = window.__sfEstado?.();
    if (!estado) return;
    const costo = window.__sfCOSTO_PRESTIGIO || 50000;
    if (estado.monedasFonda < costo) {
        toast(`Necesitás ${formatearNumero(costo)} monedas`, 'error');
        return;
    }

    const estrellasNuevas = Math.floor(estado.monedasFonda / costo);
    estado.estrellas += estrellasNuevas;
    estado.prestigios++;

    // Reset de monedas y mejoras (mantiene estrellas, hitos, productos... 
    // Espera: productos SÍ se resetean, pero los hitos completados se quedan)
    estado.monedasFonda = 0;
    estado.totalVendidos = 0;
    estado.productosDesbloqueados = ['italiano'];
    estado.upgrades = {
        velocidad: 1,
        precio: 1,
        mesas: 1,
        empleados: 1,
        decoracion: 0
    };

    document.getElementById('sfModalPrestigio').hidden = true;

    renderMejoras();
    renderProductos();
    window.__sfGuardar?.();

    toast(`¡Reabriste la fonda! +${estrellasNuevas} estrella${estrellasNuevas > 1 ? 's' : ''}`, 'success');
}

// ============================================================
//  INIT
// ============================================================
async function inicializarMejoras() {
    document.getElementById('sfOfflineOk')?.addEventListener('click', () => {
        document.getElementById('sfModalOffline').hidden = true;
        window.__sfGuardar?.();
    });

    document.getElementById('sfUnlockOk')?.addEventListener('click', () => {
        document.getElementById('sfModalUnlock').hidden = true;
    });

    document.getElementById('btnPrestigio')?.addEventListener('click', mostrarModalPrestigio);
    document.getElementById('sfPrestigioCancelar')?.addEventListener('click', () => {
        document.getElementById('sfModalPrestigio').hidden = true;
    });
    document.getElementById('sfPrestigioConfirmar')?.addEventListener('click', hacerPrestigio);

    renderProductos();
    renderMejoras();
    actualizarHUD();
}

// ============================================================
//  HOOKS EXPUESTOS
// ============================================================
window.__sfInitMejoras     = inicializarMejoras;
window.__sfRenderProductos = renderProductos;
window.__sfRenderMejoras   = renderMejoras;
window.__sfActualizarHUD   = actualizarHUD;
window.__sfCheckDesbloqueos = checkDesbloqueos;
window.__sfCheckHitos      = checkHitos;
window.__sfMostrarOffline  = offlineHook;

// Alias para que el core lo encuentre como __sfMostrarOffline
function offlineHook(n) { mostrarOffline(n); }
