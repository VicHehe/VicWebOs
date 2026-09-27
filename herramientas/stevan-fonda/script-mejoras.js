// ============================================================
//  Stevan Fonda — UI: mejoras, productos, misiones, bolsas,
//  hitos, prestigio, modal de canje.
//  Se carga ÚLTIMO.
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
//  HELPERS
// ============================================================
function formatearNumero(n) {
    n = Math.floor(Number(n) || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 100000)  return Math.floor(n / 1000) + 'k';
    if (n >= 10000)   return (n / 1000).toFixed(1).replace('.', ',') + 'k';
    return n.toString();
}

// ============================================================
//  HUD
// ============================================================
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
    if (p) {
        const prods = window.__sfProductos || [];
        const mesas = estado.upgrades.mesas;
        const vel = (1 + (estado.upgrades.velocidad - 1) * 0.1)
                  * (1 + (estado.upgrades.empleados - 1) * 0.05);
        const cookSeg = 30 / vel;
        const activos = prods.filter(x => estado.productosDesbloqueados.includes(x.id));
        if (activos.length) {
            const prom = activos.reduce((a, x) =>
                a + x.precioBase
                    * (1 + (estado.upgrades.precio - 1) * 0.15)
                    * (1 + estado.upgrades.decoracion * 0.05)
                    * (1 + estado.estrellas * 0.1), 0) / activos.length;
            const porSeg = (mesas / cookSeg) * prom;
            p.textContent = porSeg >= 10 ? formatearNumero(Math.round(porSeg))
                                         : (Math.round(porSeg * 10) / 10).toString();
        } else {
            p.textContent = '0';
        }
    }
}

// ============================================================
//  BOLSAS
// ============================================================
function renderBolsas() {
    const estado = window.__sfEstado?.();
    if (!estado) return;

    // Bolsa producción
    const bProd = Math.floor(estado.bolsaProduccion);
    const netoProd = window.__sfCalcularNeto?.(bProd) ?? bProd;
    const impuesto = bProd > 0 ? Math.round((1 - netoProd / bProd) * 100) : 0;

    const prodCant = document.getElementById('sfBolsaProdCantidad');
    if (prodCant) prodCant.textContent = formatearNumero(bProd);

    const prodNeto = document.getElementById('sfBolsaProdNeto');
    if (prodNeto) prodNeto.textContent = formatearNumero(netoProd);

    const prodDetalle = document.getElementById('sfBolsaProdDetalle');
    if (prodDetalle) {
        prodDetalle.classList.remove('impuesto-bajo', 'impuesto-medio', 'impuesto-alto');
        if (bProd === 0) {
            prodDetalle.textContent = 'Sin acumular';
        } else if (impuesto === 0) {
            prodDetalle.textContent = 'Sin impuesto';
            prodDetalle.classList.add('impuesto-bajo');
        } else if (impuesto <= 15) {
            prodDetalle.textContent = `Impuesto ${impuesto}%`;
            prodDetalle.classList.add('impuesto-bajo');
        } else if (impuesto <= 30) {
            prodDetalle.textContent = `Impuesto ${impuesto}%`;
            prodDetalle.classList.add('impuesto-medio');
        } else {
            prodDetalle.textContent = `Impuesto ${impuesto}% · ¡canjeá ya!`;
            prodDetalle.classList.add('impuesto-alto');
        }
    }

    const prodBtn = document.getElementById('sfBolsaProdBtn');
    if (prodBtn) prodBtn.disabled = bProd <= 0 || netoProd <= 0;

    // Bolsa logros
    const bLogros = Math.floor(estado.bolsaHitosMisiones);
    const logrosCant = document.getElementById('sfBolsaLogrosCantidad');
    if (logrosCant) logrosCant.textContent = formatearNumero(bLogros);

    const logrosNeto = document.getElementById('sfBolsaLogrosNeto');
    if (logrosNeto) logrosNeto.textContent = formatearNumero(bLogros);

    const logrosBtn = document.getElementById('sfBolsaLogrosBtn');
    if (logrosBtn) logrosBtn.disabled = bLogros <= 0;
}

// ============================================================
//  MISIONES
// ============================================================
function renderMisiones() {
    const cont = document.getElementById('sfMisionesLista');
    const sub = document.getElementById('sfMisionesSub');
    if (!cont) return;

    const estado = window.__sfEstado?.();
    const misiones = window.__sfMisionesDelDiaObjs?.() || [];
    if (!estado) return;

    const completadas = estado.misionesCompletadas.length;
    if (sub) sub.textContent = `${completadas}/${misiones.length}`;

    cont.innerHTML = misiones.map(m => {
        const done = estado.misionesCompletadas.includes(m.id);
        return `
            <div class="sf-mision ${done ? 'completada' : ''}">
                <div class="sf-mision-check">
                    ${done ? '<i data-lucide="check"></i>' : ''}
                </div>
                <div class="sf-mision-texto">${m.texto}</div>
                <div class="sf-mision-premio">
                    <i data-lucide="coins"></i>+${m.premio}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
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
            infoP.textContent = `Tenés ${estado.estrellas} estrella${estado.estrellas === 1 ? '' : 's'} · +${estado.estrellas * 10}% producción permanente`;
        } else if (!puede) {
            infoP.textContent = `Necesitás ${formatearNumero(costo)} monedas de fonda para reabrir`;
        } else {
            const st = Math.floor(estado.monedasFonda / costo);
            infoP.textContent = `¡Listo! Te llevarás +${st} estrella${st === 1 ? '' : 's'}`;
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
        toast('No te alcanzan las monedas de fonda', 'error');
        return;
    }
    estado.monedasFondaFloat -= costo;
    estado.monedasFonda = Math.floor(estado.monedasFondaFloat);
    estado.upgrades[id] = (estado.upgrades[id] || 0) + 1;

    // Registrar para misiones
    if (id === 'velocidad') window.__sfUpHoyRef?.velocidad++;
    if (id === 'precio')    window.__sfUpHoyRef?.precio++;
    if (id === 'mesas')     window.__sfUpHoyRef?.mesas++;
    if (id === 'empleados') window.__sfUpHoyRef?.empleados++;

    renderMejoras();
    renderProductos();
    window.__sfGuardarDebounce?.();
    toast(`${up.nombre} subió a nivel ${estado.upgrades[id]}`, 'success');
}

// ============================================================
//  HITOS (referencia UI)
// ============================================================
function renderHitos() {
    // No hay panel aparte — los hitos se muestran via toast al completarse
    // Esta función existe por si querés añadir un panel en el futuro
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

function mostrarUnlock(prod) {
    const modal = document.getElementById('sfModalUnlock');
    const item  = document.getElementById('sfUnlockItem');
    if (!modal || !item) return;
    item.innerHTML = `<i data-lucide="${prod.icono}"></i><span>${prod.nombre}</span>`;
    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

function abrirModalCanje(tipo) {
    const modal = document.getElementById('sfModalCanje');
    const desc  = document.getElementById('sfCanjeDesc');
    const desp  = document.getElementById('sfCanjeDesglose');
    if (!modal || !desc || !desp) return;

    const estado = window.__sfEstado?.();
    if (!estado) return;

    if (tipo === 'produccion') {
        const b = Math.floor(estado.bolsaProduccion);
        if (b <= 0) { toast('Nada que canjear', 'info'); return; }
        desc.textContent = `Vas a canjear tu bolsa de producción con el impuesto del SII.`;

        const desglose = window.__sfCalcularDesglose?.(b) || [];
        let html = '';
        for (const l of desglose) {
            const netoLinea = l.tasa === 0
                ? l.monto
                : Math.floor(l.monto * (1 - l.tasa / 100));
            const cssClass = l.tasa === 0 ? 'sf-canje-gratis'
                           : 'sf-canje-impuesto';
            html += `
                <div class="sf-canje-linea ${cssClass}">
                    <span>${l.label}</span>
                    <span>${l.tasa === 0 ? l.monto : `${l.monto} → ${netoLinea}`}</span>
                </div>
            `;
        }
        const neto = window.__sfCalcularNeto?.(b) ?? b;
        html += `
            <div class="sf-canje-linea sf-canje-total">
                <span>Recibirás</span>
                <strong>${neto}</strong>
            </div>
        `;
        desp.innerHTML = html;
    } else {
        const b = Math.floor(estado.bolsaHitosMisiones);
        if (b <= 0) { toast('Nada que canjear', 'info'); return; }
        desc.textContent = `Premios de hitos y misiones. Sin impuesto, van directo a tu chequera.`;
        desp.innerHTML = `
            <div class="sf-canje-linea sf-canje-gratis">
                <span>Hitos + Misiones</span>
                <span>${b} sin impuesto</span>
            </div>
            <div class="sf-canje-linea sf-canje-total">
                <span>Recibirás</span>
                <strong>${b}</strong>
            </div>
        `;
    }

    modal.dataset.tipo = tipo;
    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

async function confirmarCanje() {
    const modal = document.getElementById('sfModalCanje');
    const tipo = modal?.dataset.tipo;
    if (!tipo) return;

    const btn = document.getElementById('sfCanjeConfirmar');
    if (btn) btn.disabled = true;

    try {
        let cantidad;
        if (tipo === 'produccion') {
            cantidad = await window.__sfCanjearProduccion?.();
        } else {
            cantidad = await window.__sfCanjearLogros?.();
        }
        modal.hidden = true;
        toast(`¡+${formatearNumero(cantidad)} monedas a la chequera!`, 'success');
        renderBolsas();
    } catch (e) {
        toast(e.message || 'No se pudo canjear', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
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

    estado.monedasFondaFloat = 0;
    estado.monedasFonda = 0;
    estado.totalVendidos = 0;
    estado.productosDesbloqueados = ['italiano'];
    estado.upgrades = { velocidad: 1, precio: 1, mesas: 1, empleados: 1, decoracion: 0 };

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

    document.getElementById('btnPrestigio')?.addEventListener('click', () => {
        document.getElementById('sfModalPrestigio').hidden = false;
        if (window.lucide) lucide.createIcons();
    });
    document.getElementById('sfPrestigioCancelar')?.addEventListener('click', () => {
        document.getElementById('sfModalPrestigio').hidden = true;
    });
    document.getElementById('sfPrestigioConfirmar')?.addEventListener('click', hacerPrestigio);

    // Canje
    document.getElementById('sfBolsaProdBtn')?.addEventListener('click', () => abrirModalCanje('produccion'));
    document.getElementById('sfBolsaLogrosBtn')?.addEventListener('click', () => abrirModalCanje('logros'));
    document.getElementById('sfCanjeCancelar')?.addEventListener('click', () => {
        document.getElementById('sfModalCanje').hidden = true;
    });
    document.getElementById('sfCanjeConfirmar')?.addEventListener('click', confirmarCanje);
    document.getElementById('sfModalCanje')?.addEventListener('click', (e) => {
        if (e.target.id === 'sfModalCanje') e.target.hidden = true;
    });

    renderProductos();
    renderMejoras();
    renderMisiones();
    renderBolsas();
    actualizarHUD();
}

// ============================================================
//  HOOKS
// ============================================================
window.__sfInitMejoras     = inicializarMejoras;
window.__sfRenderProductos = renderProductos;
window.__sfRenderMejoras   = renderMejoras;
window.__sfRenderMisiones  = renderMisiones;
window.__sfRenderBolsas    = renderBolsas;
window.__sfRenderHitos     = renderHitos;
window.__sfActualizarHUD   = actualizarHUD;
window.__sfMostrarOffline  = mostrarOffline;
window.__sfMostrarUnlock   = mostrarUnlock;
window.__sfToast           = toast;
