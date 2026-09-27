// ============================================================
//  Stevan Fonda — Clientes y trabajadores reales
//  Se carga DESPUÉS de script.js.
// ============================================================

'use strict';

let miembrosComunidad = [];
let miPerfil = null;
let clientesPool = [];

async function cargarMiembros() {
    const bd = window.parent.ConfigBD;
    if (!bd) return;

    try {
        const cuentas = await bd.leerArchivoFresh('cuenta.json');
        if (Array.isArray(cuentas)) {
            miembrosComunidad = cuentas.map(c => ({
                codigo: c.codigo,
                nombre: c.nombre || c.codigo,
                foto: c.foto || null
            }));
        }
    } catch (e) {
        console.warn('[Stevan Fonda] No se pudo cargar la comunidad:', e);
    }

    const api = window.parent.__vicwebos;
    const cuenta = api?.obtenerCuenta?.();
    if (cuenta) {
        miPerfil = {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre || cuenta.codigo,
            foto: cuenta.foto || null
        };
        if (!miembrosComunidad.find(m => m.codigo === miPerfil.codigo)) {
            miembrosComunidad.push(miPerfil);
        }
    }

    clientesPool = miembrosComunidad.slice();
    if (clientesPool.length === 0) {
        clientesPool = [{ codigo: '?', nombre: 'Invitade', foto: null }];
    }
}

function elegirClienteAleatorio() {
    if (clientesPool.length === 0) return { codigo: '?', nombre: 'Invitade', foto: null };
    return clientesPool[Math.floor(Math.random() * clientesPool.length)];
}

function inicialesDe(nombre) {
    return String(nombre || '?').charAt(0).toUpperCase();
}

window.__sfAsignarCliente = function () {
    return elegirClienteAleatorio();
};

// ============================================================
//  RENDER de mesas
// ============================================================
function renderizarMesas() {
    const cont = document.getElementById('sfMesas');
    if (!cont) return;

    const mesas = window.__sfMesasActivas?.() || [];

    if (cont.children.length !== mesas.length) {
        cont.innerHTML = '';
        mesas.forEach(m => {
            const el = document.createElement('div');
            el.className = 'sf-mesa';
            el.dataset.mesaId = m.id;
            el.innerHTML = `
                <div class="sf-cliente">
                    <div class="sf-cliente-avatar" data-role="cliente-avatar">?</div>
                    <div class="sf-cliente-nombre" data-role="cliente-nombre">—</div>
                </div>
                <div class="sf-pedido">
                    <i data-lucide="circle" data-role="pedido-icono"></i>
                    <span class="sf-pedido-nombre" data-role="pedido-nombre">—</span>
                </div>
                <div class="sf-progreso">
                    <div class="sf-progreso-fill" data-role="progreso"></div>
                </div>
                <div class="sf-mesa-precio" data-role="precio">+0</div>
                <div class="sf-cocinero" data-role="cocinero"></div>
            `;
            cont.appendChild(el);
        });
        if (window.lucide) lucide.createIcons();
    }

    const prods = window.__sfProductos || [];
    const estado = window.__sfEstado?.();

    mesas.forEach(m => {
        const el = cont.querySelector(`.sf-mesa[data-mesa-id="${m.id}"]`);
        if (!el) return;

        // Cliente
        const cliAvatar = el.querySelector('[data-role="cliente-avatar"]');
        const cliNombre = el.querySelector('[data-role="cliente-nombre"]');
        if (m.cliente && cliAvatar && cliNombre) {
            if (m.cliente.foto) {
                if (cliAvatar.dataset.codigo !== m.cliente.codigo) {
                    cliAvatar.innerHTML = `<img src="${m.cliente.foto}" alt="">`;
                    cliAvatar.dataset.codigo = m.cliente.codigo;
                }
            } else {
                cliAvatar.textContent = inicialesDe(m.cliente.nombre);
                cliAvatar.dataset.codigo = m.cliente.codigo;
            }
            cliNombre.textContent = m.cliente.nombre;
        }

        // Pedido
        const pedIcono = el.querySelector('[data-role="pedido-icono"]');
        const pedNombre = el.querySelector('[data-role="pedido-nombre"]');
        if (m.producto && pedIcono && pedNombre) {
            if (pedIcono.getAttribute('data-lucide') !== m.producto.icono) {
                pedIcono.setAttribute('data-lucide', m.producto.icono);
                if (window.lucide) lucide.createIcons();
            }
            pedNombre.textContent = m.producto.nombre;
        }

        // Progreso
        const prog = el.querySelector('[data-role="progreso"]');
        if (prog) {
            const pct = Math.min(100, Math.max(0, m.progreso * 100));
            prog.style.width = pct + '%';
        }

        // Precio
        const precioEl = el.querySelector('[data-role="precio"]');
        if (precioEl && m.producto && estado) {
            const prod = prods.find(x => x.id === m.producto.id);
            if (prod) {
                const precio = window.__sfPrecioProducto?.(prod) ?? prod.precioBase;
                precioEl.textContent = '+' + precio;
            }
        }
    });

    actualizarCocinero();

    const info = document.getElementById('sfMesasInfo');
    if (info) {
        info.textContent = mesas.length === 1 ? '1 mesa' : mesas.length + ' mesas';
    }
}

function mostrarPopup(mesaId, cantidad) {
    const el = document.querySelector(`.sf-mesa[data-mesa-id="${mesaId}"]`);
    if (!el) return;

    const pop = document.createElement('div');
    pop.className = 'sf-popup';
    pop.textContent = '+' + cantidad;
    el.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);

    el.classList.add('vendiendo');
    setTimeout(() => el.classList.remove('vendiendo'), 500);
}

function actualizarCocinero() {
    const cocineros = document.querySelectorAll('[data-role="cocinero"]');
    cocineros.forEach(el => {
        if (el.dataset.pintado === '1') return;
        if (miPerfil?.foto) {
            el.innerHTML = `<img src="${miPerfil.foto}" alt="">`;
        } else if (miPerfil?.nombre) {
            el.textContent = inicialesDe(miPerfil.nombre);
        } else {
            el.innerHTML = '<i data-lucide="chef-hat" style="width:14px;height:14px;"></i>';
            if (window.lucide) lucide.createIcons();
        }
        el.dataset.pintado = '1';
    });
}

async function inicializarClientes() {
    await cargarMiembros();
    renderizarMesas();
}

window.__sfInitClientes = inicializarClientes;
window.__sfRenderMesas = renderizarMesas;
window.__sfMostrarPopup = mostrarPopup;
