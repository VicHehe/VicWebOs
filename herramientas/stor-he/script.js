// ============================================================
//  Stor-He — Lógica
//  Tabs: Apps / Temas / Widgets / PromoZione
//  + Carrito · Buscador · Ampliación con progreso
//  Compatible con TODOS los temas (var() con fallbacks).
//  Sin emojis.
// ============================================================

const API = () => window.parent.__vicwebos || null;
const PZ  = () => window.parent.PromoZione || null;
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

const _accionesEnVuelo = new Set();

let _timerOfertas = null;
let _busquedaActual = '';
let _tabActual = 'apps';

// ============================================================
//  PAQUETES DE ESPACIO (compra rápida)
// ============================================================
const PAQUETES_ESPACIO = [
    { cantidad: 5,   compras: 1,  costoBruto: 350,  ahorro: 0   },
    { cantidad: 15,  compras: 3,  costoBruto: 1050, ahorro: 50  },
    { cantidad: 50,  compras: 10, costoBruto: 3500, ahorro: 200 },
    { cantidad: 100, compras: 20, costoBruto: 7000, ahorro: 350 }
];

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
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('shToast');
    if (!el) return;
    const icono = tipo === 'success' ? 'check-circle-2'
                : tipo === 'error'   ? 'alert-circle'
                : 'info';
    el.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    el.className = 'sh-toast show ' + tipo;
    lucide.createIcons();
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  RECURSOS (espacio / monedas)
// ============================================================
function actualizarRecursos() {
    const api = API();
    if (!api) return;
    const espacioMax   = api.obtenerEspacioMaximo() ?? 50;
    const espacioUsado = api.obtenerEspacioUsado() ?? 0;
    const monedas      = api.obtenerMonedas() ?? 0;

    const elEsp = document.getElementById('shEspacio');
    const elMon = document.getElementById('shMonedas');
    if (elEsp) elEsp.textContent = `${espacioUsado} / ${espacioMax}`;
    if (elMon) elMon.textContent = monedas;
}

// ============================================================
//  CARRITO
// ============================================================
let _carrito = new Map();

function _carritoKey() {
    const api = API();
    const c = api && api.obtenerCuenta ? api.obtenerCuenta() : null;
    return `sh_carrito_${c && c.codigo ? c.codigo : 'anon'}`;
}

function cargarCarrito() {
    _carrito = new Map();
    try {
        const raw = localStorage.getItem(_carritoKey());
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        arr.forEach(x => {
            if (x && x.tipo && x.id) _carrito.set(`${x.tipo}:${x.id}`, x);
        });
    } catch (e) { _carrito = new Map(); }
}

function guardarCarrito() {
    try {
        const arr = Array.from(_carrito.values());
        localStorage.setItem(_carritoKey(), JSON.stringify(arr));
    } catch (e) { /* silencioso */ }
}

function carritoEsta(tipo, id) {
    return _carrito.has(`${tipo}:${id}`);
}

function carritoAñadir(tipo, item) {
    const key = `${tipo}:${item.id}`;
    if (_carrito.has(key)) return false;
    _carrito.set(key, {
        tipo,
        id: item.id,
        nombre: item.nombre || item.id,
        icono: item.icono || 'circle',
        espacio: item.espacio || 0,
        monedas: item.monedas || 0
    });
    guardarCarrito();
    return true;
}

function carritoQuitar(tipo, id) {
    _carrito.delete(`${tipo}:${id}`);
    guardarCarrito();
}

function carritoVaciar() {
    _carrito.clear();
    guardarCarrito();
}

function carritoTotal() {
    let espacio = 0, monedas = 0;
    _carrito.forEach(x => { espacio += x.espacio; monedas += x.monedas; });
    return { espacio, monedas, count: _carrito.size };
}

function limpiarCarritoInstalados() {
    const api = API();
    if (!api) return;
    const apps    = api.obtenerInstaladas() || [];
    const temas   = api.obtenerTemasInstalados() || [];
    const widgets = api.obtenerWidgetsInstalados() || [];
    let cambio = false;
    _carrito.forEach((x, k) => {
        const yaEsta =
            (x.tipo === 'app'    && apps.includes(x.id)) ||
            (x.tipo === 'tema'   && temas.includes(x.id)) ||
            (x.tipo === 'widget' && widgets.includes(x.id));
        if (yaEsta) { _carrito.delete(k); cambio = true; }
    });
    if (cambio) guardarCarrito();
}

function _tipoNombreSimple(tipo) {
    if (tipo === 'app')    return 'App';
    if (tipo === 'tema')   return 'Tema';
    if (tipo === 'widget') return 'Widget';
    return '';
}

// ---------- Barra del carrito ----------
function renderCarritoBar() {
    const bar = document.getElementById('shCartBar');
    if (!bar) return;
    const t = carritoTotal();
    if (t.count === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    const cCount = document.getElementById('shCartCount');
    const cLabel = document.getElementById('shCartCountLabel');
    const cEsp   = document.getElementById('shCartEspacio');
    const cMon   = document.getElementById('shCartMonedas');
    if (cCount) cCount.textContent = t.count;
    if (cLabel) cLabel.textContent = t.count === 1 ? 'item' : 'items';
    if (cEsp)   cEsp.textContent = t.espacio;
    if (cMon)   cMon.textContent = t.monedas;
}

// ---------- Modal del carrito ----------
function renderCarritoModal() {
    const lista = document.getElementById('shCartLista');
    if (!lista) return;
    const items = Array.from(_carrito.values());

    if (items.length === 0) {
        lista.innerHTML = `
            <div class="sh-cart-vacio">
                <i data-lucide="shopping-cart"></i>
                <h3>Tu carrito está vacío</h3>
                <p>Agregá apps, temas o widgets desde el catálogo.</p>
            </div>`;
        lucide.createIcons();
    } else {
        lista.innerHTML = items.map(x => `
            <div class="sh-cart-item">
                <div class="sh-cart-item-icono"><i data-lucide="${x.icono}"></i></div>
                <div class="sh-cart-item-info">
                    <div class="sh-cart-item-nombre">${x.nombre}</div>
                    <div class="sh-cart-item-tipo">${_tipoNombreSimple(x.tipo)}</div>
                </div>
                <div class="sh-cart-item-costos">
                    ${x.espacio > 0 ? `<span class="sh-coste sh-coste-esp"><i data-lucide="hard-drive"></i> ${x.espacio}</span>` : ''}
                    ${x.monedas > 0 ? `<span class="sh-coste sh-coste-mon"><i data-lucide="coins"></i> ${x.monedas}</span>` : ''}
                    ${x.espacio === 0 && x.monedas === 0 ? `<span class="sh-coste sh-coste-esp">Gratis</span>` : ''}
                </div>
                <button class="sh-btn sh-btn-icono" data-accion="carritoQuitar" data-tipo="${x.tipo}" data-id="${x.id}" title="Quitar del carrito">
                    <i data-lucide="x"></i>
                </button>
            </div>
        `).join('');
        lucide.createIcons();
    }

    const t = carritoTotal();
    const elEsp = document.getElementById('shCartModalEspacio');
    const elMon = document.getElementById('shCartModalMonedas');
    if (elEsp) elEsp.textContent = t.espacio;
    if (elMon) elMon.textContent = t.monedas;

    const api = API();
    const btnComprar = document.getElementById('shCartComprar');
    if (!btnComprar) return;
    const monedasDisp = api ? (api.obtenerMonedas() ?? 0) : 0;
    const espLibre    = api ? (api.obtenerEspacioLibre() ?? 0) : 0;

    if (t.count === 0) {
        btnComprar.disabled = true;
        btnComprar.title = '';
    } else if (t.monedas > monedasDisp) {
        btnComprar.disabled = true;
        btnComprar.title = `Te faltan ${t.monedas - monedasDisp} monedas`;
    } else if (t.espacio > espLibre) {
        btnComprar.disabled = true;
        btnComprar.title = `Te falta ${t.espacio - espLibre} de espacio`;
    } else {
        btnComprar.disabled = false;
        btnComprar.title = '';
    }
}

function abrirCarrito() {
    const modal = document.getElementById('shCartModal');
    if (!modal) return;
    limpiarCarritoInstalados();
    renderCarritoModal();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function cerrarCarrito() {
    const modal = document.getElementById('shCartModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

async function comprarCarrito() {
    const api = API();
    if (!api) return;
    const items = Array.from(_carrito.values());
    if (items.length === 0) return;

    const btn = document.getElementById('shCartComprar');
    if (!btn || btn.disabled) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Comprando...';
    lucide.createIcons();

    let ok = 0;
    const errores = [];

    for (const x of items) {
        try {
            if (x.tipo === 'app')         await api.instalar(x.id);
            else if (x.tipo === 'tema')   await api.instalarTema(x.id);
            else if (x.tipo === 'widget') await api.instalarWidget(x.id);
            carritoQuitar(x.tipo, x.id);
            ok++;
        } catch (e) {
            errores.push(`${x.nombre}: ${e.message}`);
        }
    }

    btn.disabled = false;
    btn.innerHTML = original;
    lucide.createIcons();

    if (errores.length === 0) {
        toast(`${ok} ${ok === 1 ? 'item comprado' : 'items comprados'}`, 'success');
        cerrarCarrito();
    } else if (ok > 0) {
        toast(`${ok} ok, ${errores.length} con error`, 'info');
    } else {
        toast(errores[0] || 'Error al comprar', 'error');
    }

    renderCarritoBar();
    renderCarritoModal();
    refrescarTodo();
}

// ============================================================
//  BUSCADOR
// ============================================================
function _normalizar(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _coincide(item, q) {
    if (!q) return true;
    const nq = _normalizar(q);
    return _normalizar(item.nombre).includes(nq) ||
           _normalizar(item.descripcion).includes(nq) ||
           _normalizar(item.categoria).includes(nq);
}

function _placeholderBusqueda(tab) {
    if (tab === 'apps')    return 'Buscar apps...';
    if (tab === 'temas')   return 'Buscar temas...';
    if (tab === 'widgets') return 'Buscar widgets...';
    return 'Buscar...';
}

function renderBusquedaVacia(cont, q) {
    cont.innerHTML = `
        <div class="sh-empty">
            <i data-lucide="search-x"></i>
            <h3>Sin resultados</h3>
            <p>Nada coincide con "<strong>${q}</strong>".</p>
        </div>`;
    lucide.createIcons();
}

function actualizarBuscadorVisibilidad(tab) {
    const wrap = document.getElementById('shSearchWrap');
    const input = document.getElementById('shSearch');
    if (!wrap || !input) return;
    if (tab === 'promozione') {
        wrap.style.display = 'none';
        input.value = '';
        _busquedaActual = '';
        const clr = document.getElementById('shSearchClear');
        if (clr) clr.style.display = 'none';
    } else {
        wrap.style.display = 'flex';
        input.placeholder = _placeholderBusqueda(tab);
    }
}

// ============================================================
//  AMPLIACIÓN DE ESPACIO
// ============================================================
function renderAmpliacion() {
    const cont = document.getElementById('shAmpliacion');
    const api = API();
    if (!cont || !api) return;

    const max     = api.obtenerEspacioMaximo() ?? 50;
    const monedas = api.obtenerMonedas() ?? 0;

    cont.innerHTML = `
        <div class="sh-ampliacion-card">
            <div class="sh-ampliacion-header">
                <div class="sh-ampliacion-icono"><i data-lucide="hard-drive"></i></div>
                <div class="sh-ampliacion-info">
                    <div class="sh-ampliacion-titulo">Ampliar espacio</div>
                    <div class="sh-ampliacion-desc">
                        Tenés <strong>${max}</strong> de espacio total. Elegí cuánto querés añadir.
                    </div>
                </div>
            </div>
            <div class="sh-amp-grid">
                ${PAQUETES_ESPACIO.map(o => {
                    const total = o.costoBruto - o.ahorro;
                    const puede = monedas >= total;
                    const badge = o.ahorro > 0
                        ? `<span class="sh-amp-ahorro">−${o.ahorro}</span>`
                        : '';
                    return `
                        <button class="sh-amp-opcion ${puede ? '' : 'disabled'}"
                                data-accion="abrirCompraEspacio"
                                data-cantidad="${o.cantidad}"
                                data-compras="${o.compras}"
                                data-costo-bruto="${o.costoBruto}"
                                data-ahorro="${o.ahorro}"
                                data-total="${total}"
                                ${puede ? '' : 'disabled'}
                                title="${puede ? '' : `Te faltan ${total - monedas} monedas`}">
                            <div class="sh-amp-cantidad">+${o.cantidad}</div>
                            <div class="sh-amp-precio">
                                <i data-lucide="coins"></i> ${total}
                                ${o.ahorro > 0 ? `<s>${o.costoBruto}</s>` : ''}
                            </div>
                            ${badge}
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    lucide.createIcons();
}

// ---------- Modal con progreso ----------
let _ampCtx = null;
let _ampEnProgreso = false;

function _qs(id) { return document.getElementById(id); }

function _ampSetVista(vista) {
    const v1 = _qs('shAmpVistaConfirmar');
    const v2 = _qs('shAmpVistaProgreso');
    const v3 = _qs('shAmpVistaExito');
    if (v1) v1.style.display = vista === 'confirmar' ? 'block' : 'none';
    if (v2) v2.style.display = vista === 'progreso'  ? 'block' : 'none';
    if (v3) v3.style.display = vista === 'exito'     ? 'block' : 'none';
}

function abrirModalEspacio(cantidad, compras, costoBruto, ahorro, total) {
    const modal = _qs('shAmpModal');
    if (!modal) return;

    _ampCtx = { cantidad, compras, costoBruto, ahorro, total };

    _qs('shAmpConfirmarCantidad').textContent = cantidad;
    _qs('shAmpConfirmarCompras').textContent  = compras;
    _qs('shAmpConfirmarTotal').textContent    = total;

    const wrapDesc = _qs('shAmpConfirmarDescuentoWrap');
    if (wrapDesc) wrapDesc.style.display = ahorro > 0 ? 'flex' : 'none';
    if (ahorro > 0) _qs('shAmpConfirmarDescuento').textContent = ahorro;

    _ampSetVista('confirmar');
    modal.style.display = 'flex';
    lucide.createIcons();
}

function cerrarModalEspacio() {
    if (_ampEnProgreso) return;
    const modal = _qs('shAmpModal');
    if (modal) modal.style.display = 'none';
    _ampCtx = null;
}

async function ejecutarCompraEspacio() {
    const api = API();
    if (!api || !_ampCtx) return;

    _ampEnProgreso = true;

    const btnClose = _qs('shAmpClose');
    if (btnClose) btnClose.style.display = 'none';

    const { cantidad, compras, ahorro } = _ampCtx;

    _ampSetVista('progreso');
    _qs('shAmpProgresoSub').textContent = `Compra 0 de ${compras}`;
    _qs('shAmpProgresoFill').style.width = '0%';
    _qs('shAmpProgresoPct').textContent = '0%';
    lucide.createIcons();

    let exitos = 0;
    let errorFinal = null;

    for (let i = 0; i < compras; i++) {
        try {
            await api.comprarEspacio();
            exitos++;
        } catch (e) {
            errorFinal = e;
            break;
        }

        const pct = Math.round(((i + 1) / compras) * 100);
        _qs('shAmpProgresoSub').textContent = `Compra ${i + 1} de ${compras}`;
        _qs('shAmpProgresoFill').style.width = pct + '%';
        _qs('shAmpProgresoPct').textContent = pct + '%';

        await new Promise(r => setTimeout(r, 300));
    }

    if (!errorFinal && ahorro > 0 && exitos === compras) {
        try {
            await api.canjear(
                'hard-drive',
                'stor-he',
                `Descuento por compra en volumen (+${cantidad})`,
                ahorro
            );
        } catch (e) {
            console.warn('No se pudo aplicar el descuento:', e);
        }
    }

    _ampEnProgreso = false;
    if (btnClose) btnClose.style.display = 'flex';

    if (errorFinal) {
        _ampSetVista('confirmar');
        toast(errorFinal.message || 'Error al ampliar espacio', 'error');
        cerrarModalEspacio();
        refrescarTodo();
        return;
    }

    const nuevoMax = api.obtenerEspacioMaximo() ?? 0;
    _qs('shAmpExitoTotal').textContent = nuevoMax;

    const wrapAhorro = _qs('shAmpExitoDescuento');
    if (wrapAhorro) {
        wrapAhorro.style.display = ahorro > 0 ? 'flex' : 'none';
        if (ahorro > 0) _qs('shAmpExitoAhorro').textContent = ahorro;
    }

    _ampSetVista('exito');
    lucide.createIcons();
    refrescarTodo();
}

// ============================================================
//  HELPERS DE RENDER
// ============================================================
function agruparPorCategoria(lista) {
    const cats = {};
    lista.forEach(item => {
        const c = item.categoria || 'General';
        (cats[c] = cats[c] || []).push(item);
    });
    return cats;
}

function renderGrid(contenedor, lista, renderCard) {
    if (!contenedor) return;

    if (lista.length === 0) {
        contenedor.innerHTML = `
            <div class="sh-empty">
                <i data-lucide="package-open"></i>
                <h3>No hay nada por aquí</h3>
                <p>El catálogo está vacío o no se pudo cargar.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const cats = agruparPorCategoria(lista);
    let html = '';
    for (const [cat, items] of Object.entries(cats)) {
        html += `<div class="sh-categoria">`;
        html += `<div class="sh-categoria-titulo">${cat}</div>`;
        html += `<div class="sh-grid">`;
        items.forEach(item => { html += renderCard(item); });
        html += `</div></div>`;
    }
    contenedor.innerHTML = html;
    lucide.createIcons();
}

function etiquetaCosto(item) {
    const partes = [];
    if ((item.espacio || 0) > 0) {
        partes.push(`<span class="sh-coste sh-coste-esp"><i data-lucide="hard-drive"></i> ${item.espacio}</span>`);
    }
    if ((item.monedas || 0) > 0) {
        partes.push(`<span class="sh-coste sh-coste-mon"><i data-lucide="coins"></i> ${item.monedas}</span>`);
    }
    if (partes.length === 0) return '';
    return `<div class="sh-costes">${partes.join('')}</div>`;
}

// ---------- Botones de no-instalado (carrito + instalar ya) ----------
function _botonesNoInstalado(tipo, item, bloqueado, motivo) {
    const enCarrito = carritoEsta(tipo, item.id);

    const clasePrincipal = enCarrito
        ? 'sh-btn-carrito-activo'
        : (bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar');

    const disabledPrincipal = (!enCarrito && bloqueado) ? 'disabled' : '';
    const titlePrincipal = enCarrito
        ? 'Quitar del carrito'
        : (bloqueado ? motivo : 'Añadir al carrito');

    const iconoPrincipal = enCarrito ? 'check' : 'shopping-cart';
    const textoPrincipal = enCarrito ? 'En carrito' : 'Agregar';

    const accionInstalar = tipo === 'app' ? 'instalar'
                         : tipo === 'tema' ? 'instalarTema'
                         : 'instalarWidget';

    return `
        <div class="sh-acciones">
            <button class="sh-btn ${clasePrincipal}"
                    data-accion="carrito"
                    data-tipo="${tipo}"
                    data-id="${item.id}"
                    ${disabledPrincipal}
                    title="${titlePrincipal}">
                <i data-lucide="${iconoPrincipal}"></i>
                ${textoPrincipal}
            </button>
            ${!enCarrito ? `
                <button class="sh-btn sh-btn-icono sh-btn-instalar-ya"
                        data-accion="${accionInstalar}"
                        data-id="${item.id}"
                        ${bloqueado ? `disabled title="${motivo}"` : ''}
                        title="Instalar ahora">
                    <i data-lucide="zap"></i>
                </button>
            ` : ''}
        </div>`;
}

// ============================================================
//  TAB: APPS
// ============================================================
function renderApps() {
    const api = API();
    const cont = document.getElementById('appsContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo   = api.obtenerCatalogo() || [];
    const instaladas = api.obtenerInstaladas() || [];
    document.getElementById('countApps').textContent = catalogo.length;

    const filtrado = catalogo.filter(a => _coincide(a, _busquedaActual));
    if (filtrado.length === 0 && _busquedaActual) {
        renderBusquedaVacia(cont, _busquedaActual);
        return;
    }

    renderGrid(cont, filtrado, (app) => {
        const instalada = instaladas.includes(app.id);
        const esBase    = !!app.esBase;
        const check     = api.puedeInstalar({ espacio: app.espacio || 0, monedas: app.monedas || 0 });
        const bloqueado = !instalada && !check.ok;

        return `
            <div class="sh-card ${instalada ? 'instalada' : ''}" data-id="${app.id}">
                <div class="sh-card-header">
                    <div class="sh-card-icono"><i data-lucide="${app.icono || 'circle'}"></i></div>
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${app.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Sistema</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${app.descripcion || ''}</div>
                        ${etiquetaCosto(app)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalada
                        ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Activa</span>
                           <div class="sh-acciones">
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalar" data-id="${app.id}" title="Quitar del sidebar">
                                    <i data-lucide="minus-circle"></i>
                                </button>`}
                             <button class="sh-btn sh-btn-abrir" data-accion="abrir" data-id="${app.id}">
                                <i data-lucide="external-link"></i> Abrir
                             </button>
                           </div>`
                        : _botonesNoInstalado('app', app, bloqueado, check.motivo)}
                </div>
            </div>`;
    });
}

// ============================================================
//  TAB: TEMAS
// ============================================================
function renderTemaPreview(colores) {
    const c100  = colores['--violet-100'] || '#EDE9FE';
    const c300  = colores['--violet-300'] || '#C4B5FD';
    const c500  = colores['--violet-500'] || '#8B5CF6';
    const bg    = colores['--bg']         || '#FBFBFD';
    const bgAlt = colores['--bg-alt']     || '#F5F5F8';
    const white = colores['--white']      || '#FFFFFF';

    return `
        <div class="sh-tema-preview" style="background:${bg};">
            <div class="sh-tema-preview-header" style="background:${white};">
                <div class="sh-tema-preview-header-dot" style="background:${c500};"></div>
                <div class="sh-tema-preview-header-dot" style="background:${c300};"></div>
                <div class="sh-tema-preview-header-dot" style="background:${c100};"></div>
            </div>
            <div class="sh-tema-preview-body">
                <div class="sh-tema-preview-sidebar" style="background:${bgAlt};"></div>
                <div class="sh-tema-preview-content" style="background:${white};">
                    <div class="sh-tema-preview-line w80" style="background:${c500};"></div>
                    <div class="sh-tema-preview-line w60" style="background:${c300};"></div>
                    <div class="sh-tema-preview-line w40" style="background:${c100};"></div>
                </div>
            </div>
        </div>`;
}

function renderTemas() {
    const api = API();
    const cont = document.getElementById('temasContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo   = api.obtenerTemas() || [];
    const instalados = api.obtenerTemasInstalados() || [];
    const activo     = api.obtenerTemaActivo();

    document.getElementById('countTemas').textContent = catalogo.length;

    const filtrado = catalogo.filter(t => _coincide(t, _busquedaActual));
    if (filtrado.length === 0 && _busquedaActual) {
        renderBusquedaVacia(cont, _busquedaActual);
        return;
    }

    renderGrid(cont, filtrado, (tema) => {
        const instalado = instalados.includes(tema.id);
        const esBase    = !!tema.esBase;
        const esActivo  = activo === tema.id;
        const check     = api.puedeInstalar({ espacio: tema.espacio || 0, monedas: tema.monedas || 0 });
        const bloqueado = !instalado && !check.ok;

        return `
            <div class="sh-card ${instalado ? 'instalada' : ''}" data-id="${tema.id}">
                ${renderTemaPreview(tema.colores || {})}
                <div class="sh-card-header">
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${tema.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Base</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${tema.descripcion || ''}</div>
                        ${etiquetaCosto(tema)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalado
                        ? `${esActivo
                             ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Aplicado</span>`
                             : `<button class="sh-btn sh-btn-aplicar" data-accion="aplicarTema" data-id="${tema.id}">
                                    <i data-lucide="play"></i> Aplicar
                                </button>`}
                           <div class="sh-acciones">
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalarTema" data-id="${tema.id}" title="Desinstalar">
                                    <i data-lucide="trash-2"></i>
                                </button>`}
                           </div>`
                        : _botonesNoInstalado('tema', tema, bloqueado, check.motivo)}
                </div>
            </div>`;
    });
}

// ============================================================
//  TAB: WIDGETS
// ============================================================
function renderWidgets() {
    const api = API();
    const cont = document.getElementById('widgetsContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo   = api.obtenerWidgets() || [];
    const instalados = api.obtenerWidgetsInstalados() || [];

    document.getElementById('countWidgets').textContent = catalogo.length;

    const filtrado = catalogo.filter(w => _coincide(w, _busquedaActual));
    if (filtrado.length === 0 && _busquedaActual) {
        renderBusquedaVacia(cont, _busquedaActual);
        return;
    }

    renderGrid(cont, filtrado, (widget) => {
        const instalado = instalados.includes(widget.id);
        const esBase    = !!widget.esBase;
        const check     = api.puedeInstalar({ espacio: widget.espacio || 0, monedas: widget.monedas || 0 });
        const bloqueado = !instalado && !check.ok;

        return `
            <div class="sh-card ${instalado ? 'instalada' : ''}" data-id="${widget.id}">
                <div class="sh-card-header">
                    <div class="sh-card-icono"><i data-lucide="${widget.icono || 'square'}"></i></div>
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${widget.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Sistema</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${widget.descripcion || ''}</div>
                        ${etiquetaCosto(widget)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalado
                        ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Instalado</span>
                           <div class="sh-acciones">
                             <small style="font-size:11px;color:var(--gray-500);margin-right:6px;">
                                Actívalo en Configuración
                             </small>
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalarWidget" data-id="${widget.id}" title="Desinstalar">
                                    <i data-lucide="trash-2"></i>
                                </button>`}
                           </div>`
                        : _botonesNoInstalado('widget', widget, bloqueado, check.motivo)}
                </div>
            </div>`;
    });
}

// ============================================================
//  TAB: PROMOZIONE
// ============================================================
function _tipoIcono(tipo) {
    if (tipo === 'app')    return 'package';
    if (tipo === 'tema')   return 'palette';
    if (tipo === 'widget') return 'layout-grid';
    return 'circle';
}

function _tipoNombre(tipo) {
    if (tipo === 'app')    return 'App';
    if (tipo === 'tema')   return 'Tema';
    if (tipo === 'widget') return 'Widget';
    return '';
}

function _claseDescuento(d) {
    if (d >= 75) return 'sh-desc-75';
    if (d >= 50) return 'sh-desc-50';
    return 'sh-desc-25';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function renderPromoZione() {
    const cont = document.getElementById('promoContenido');
    if (!cont) return;

    const pz = PZ();
    if (!pz) {
        cont.innerHTML = `
            <div class="sh-empty">
                <i data-lucide="alert-triangle"></i>
                <h3>PromoZione no está disponible</h3>
                <p>Falta cargar <code>js/PaquetePromo.js</code> en el shell.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const api = API();
    if (!api) {
        cont.innerHTML = `
            <div class="sh-empty">
                <i data-lucide="alert-triangle"></i>
                <h3>Error de conexión</h3>
                <p>No se pudo conectar con VicWebOS.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const paquetes = pz.obtenerPaquetesVisibles() || [];
    const ofertasCount = _ofertasCache ? _ofertasCache.length : null;
    const countEl = document.getElementById('countPromo');
    if (countEl) countEl.textContent = String(paquetes.length + (ofertasCount || 0));

    cont.innerHTML = `
        <div class="sh-promo-header">
            <div class="sh-promo-header-icono"><i data-lucide="sparkles"></i></div>
            <div class="sh-promo-header-texto">
                <h2>PromoZione</h2>
                <p>Paquetes con descuento y ofertas que rotan cada medianoche (hora de Chile).</p>
            </div>
        </div>

        <section class="sh-promo-seccion">
            <div class="sh-promo-seccion-header">
                <h3><i data-lucide="gift"></i> Paquetes</h3>
                <span class="sh-promo-seccion-sub">Combos curados a precio fijo</span>
            </div>
            <div id="shPaquetesGrid"></div>
        </section>

        <section class="sh-promo-seccion">
            <div class="sh-promo-seccion-header">
                <h3><i data-lucide="timer"></i> Ofertas del día</h3>
                <div class="sh-oferta-timer" id="shOfertaTimer">
                    <i data-lucide="clock"></i>
                    <span id="shOfertaTimerTexto">--:--:--</span>
                </div>
            </div>
            <div class="sh-oferta-progress">
                <div class="sh-oferta-progress-fill" id="shOfertaBarra"></div>
            </div>
            <div id="shOfertasGrid"></div>
        </section>
    `;
    lucide.createIcons();

    renderPaquetes();
    renderOfertas();
    iniciarTimerOfertas();
}

// ---------- PAQUETES ----------
function renderPaquetes() {
    const cont = document.getElementById('shPaquetesGrid');
    const pz = PZ();
    const api = API();
    if (!cont || !pz || !api) return;

    const paquetes = pz.obtenerPaquetesVisibles() || [];

    if (paquetes.length === 0) {
        cont.innerHTML = `
            <div class="sh-empty" style="padding: 30px 20px;">
                <i data-lucide="gift"></i>
                <h3>No hay paquetes por ahora</h3>
                <p>Cuando agregues paquetes en <code>PaquetePromo.js</code> aparecerán acá.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const monedas = api.obtenerMonedas() ?? 0;
    const espacioLibre = api.obtenerEspacioLibre() ?? 0;

    cont.innerHTML = `<div class="sh-promo-grid sh-promo-grid-paquetes">${
        paquetes.map(p => {
            const itemsHTML = p.items.map(it => `
                <span class="sh-pack-item ${it.yaLoTiene ? 'tiene' : ''}">
                    <i data-lucide="${it.icono}"></i>
                    <span>${it.nombre}</span>
                    ${it.yaLoTiene ? '<i data-lucide="check" class="sh-pack-item-check"></i>' : ''}
                </span>
            `).join('');

            const ahorro = p.precioCatalogo - p.precio;
            const ahorroBadge = ahorro > 0
                ? `<span class="sh-pack-ahorro">Ahorrás ${ahorro}</span>`
                : '';

            const sinMonedas  = monedas < p.precio;
            const sinEspacio  = espacioLibre < p.espacio;
            const bloqueado   = sinMonedas || sinEspacio;
            const motivo = sinEspacio
                ? `Necesitás ${p.espacio} de espacio (tenés ${espacioLibre}).`
                : sinMonedas
                    ? `Te faltan ${p.precio - monedas} monedas.`
                    : '';

            return `
                <div class="sh-pack-card" data-id="${p.id}">
                    <div class="sh-pack-header">
                        <div class="sh-pack-icono"><i data-lucide="${p.icono}"></i></div>
                        <div class="sh-pack-titulo">
                            <h4>${p.nombre} ${ahorroBadge}</h4>
                            <p>${p.descripcion}</p>
                        </div>
                    </div>
                    <div class="sh-pack-items">${itemsHTML}</div>
                    <div class="sh-pack-pie">
                        <div class="sh-pack-costos">
                            <span class="sh-coste sh-coste-esp"><i data-lucide="hard-drive"></i> ${p.espacio}</span>
                            <span class="sh-coste sh-coste-mon">
                                <i data-lucide="coins"></i>
                                ${p.precio}
                                ${p.precioCatalogo > p.precio ? `<s>${p.precioCatalogo}</s>` : ''}
                            </span>
                        </div>
                        <button class="sh-btn ${bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar'}"
                                data-accion="comprarPaquete" data-id="${p.id}"
                                ${bloqueado ? `disabled title="${motivo}"` : ''}>
                            <i data-lucide="shopping-bag"></i> Comprar
                        </button>
                    </div>
                </div>`;
        }).join('')
    }</div>`;
    lucide.createIcons();
}

// ---------- OFERTAS ----------
let _ofertasCache = null;

async function renderOfertas() {
    const cont = document.getElementById('shOfertasGrid');
    const pz = PZ();
    const api = API();
    if (!cont || !pz || !api) return;

    cont.innerHTML = `
        <div class="sh-empty" style="padding: 30px 20px;">
            <i data-lucide="loader-2" class="spin"></i>
            <p>Cargando ofertas del día...</p>
        </div>`;
    lucide.createIcons();

    let ofertas = [];
    try {
        ofertas = await pz.obtenerOfertasDelDia();
    } catch (e) {
        ofertas = [];
    }
    _ofertasCache = ofertas;

    if (ofertas.length === 0) {
        cont.innerHTML = `
            <div class="sh-empty" style="padding: 30px 20px;">
                <i data-lucide="check-circle-2"></i>
                <h3>Ya aprovechaste las ofertas de hoy</h3>
                <p>Volvé mañana cuando roten. O compraste todo, o no hay nada disponible.</p>
            </div>`;
        lucide.createIcons();
        _actualizarCountPromo();
        return;
    }

    const monedas = api.obtenerMonedas() ?? 0;
    const espacioLibre = api.obtenerEspacioLibre() ?? 0;

    cont.innerHTML = `<div class="sh-promo-grid sh-promo-grid-ofertas">${
        ofertas.map(o => {
            const sinMonedas = monedas < o.precioFinal;
            const sinEspacio = espacioLibre < o.espacio;
            const bloqueado  = sinMonedas || sinEspacio;
            const motivo = sinEspacio
                ? `Necesitás ${o.espacio} de espacio (tenés ${espacioLibre}).`
                : sinMonedas
                    ? `Te faltan ${o.precioFinal - monedas} monedas.`
                    : '';

            return `
                <div class="sh-oferta-card ${_claseDescuento(o.descuento)}" data-tipo="${o.tipo}" data-id="${o.id}">
                    <div class="sh-oferta-badge">-${o.descuento}%</div>
                    <div class="sh-oferta-tipo">
                        <i data-lucide="${_tipoIcono(o.tipo)}"></i>
                        <span>${_tipoNombre(o.tipo)}</span>
                    </div>
                    <div class="sh-oferta-icono"><i data-lucide="${o.icono}"></i></div>
                    <h4 class="sh-oferta-nombre">${o.nombre}</h4>
                    <p class="sh-oferta-desc">${o.descripcion}</p>
                    <div class="sh-oferta-precio">
                        <span class="sh-oferta-precio-original">${o.precioOriginal}</span>
                        <span class="sh-oferta-precio-final"><i data-lucide="coins"></i> ${o.precioFinal}</span>
                    </div>
                    <div class="sh-oferta-espacio">
                        <i data-lucide="hard-drive"></i> ${o.espacio} de espacio
                    </div>
                    <button class="sh-btn ${bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar'} sh-btn-full"
                            data-accion="comprarOferta"
                            data-tipo="${o.tipo}"
                            data-id="${o.id}"
                            data-descuento="${o.descuento}"
                            ${bloqueado ? `disabled title="${motivo}"` : ''}>
                        <i data-lucide="zap"></i> Aprovechar
                    </button>
                </div>`;
        }).join('')
    }</div>`;
    lucide.createIcons();
    _actualizarCountPromo();
}

function _actualizarCountPromo() {
    const el = document.getElementById('countPromo');
    if (!el) return;
    const pz = PZ();
    if (!pz) { el.textContent = '•'; return; }
    const paquetes = (pz.obtenerPaquetesVisibles() || []).length;
    const ofertas  = (_ofertasCache || []).length;
    el.textContent = String(paquetes + ofertas);
}

// ---------- TIMER ----------
function iniciarTimerOfertas() {
    detenerTimerOfertas();
    const txt = document.getElementById('shOfertaTimerTexto');
    const bar = document.getElementById('shOfertaBarra');
    if (!txt) return;
    const pz = PZ();
    if (!pz) return;

    const totalDia = 86400000;

    const actualizar = () => {
        const ms = pz.msHastaProximaMedianocheChile();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        txt.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
        if (bar) {
            const pct = ((totalDia - ms) / totalDia) * 100;
            bar.style.width = pct.toFixed(2) + '%';
        }
    };
    actualizar();
    _timerOfertas = setInterval(actualizar, 1000);
}

function detenerTimerOfertas() {
    if (_timerOfertas) {
        clearInterval(_timerOfertas);
        _timerOfertas = null;
    }
}

// ============================================================
//  ACCIONES
// ============================================================
async function manejarAccion(accion, id, btnOrigen, extra) {
    const api = API();
    const pz = PZ();
    if (!api) return;

    // --- Abrir modal de ampliación (no async) ---
    if (accion === 'abrirCompraEspacio') {
        if (!btnOrigen) return;
        const d = btnOrigen.dataset;
        abrirModalEspacio(
            Number(d.cantidad),
            Number(d.compras),
            Number(d.costoBruto),
            Number(d.ahorro),
            Number(d.total)
        );
        return;
    }

    // --- Carrito: acciones locales ---
    if (accion === 'carrito') {
        const tipo = (btnOrigen && btnOrigen.dataset.tipo) || 'app';
        const item = _buscarItemPorId(tipo, id);
        if (!item) return;
        if (carritoEsta(tipo, id)) {
            carritoQuitar(tipo, id);
            toast('Quitado del carrito', 'info');
        } else {
            carritoAñadir(tipo, item);
            toast('Añadido al carrito', 'success');
        }
        renderCarritoBar();
        if (tipo === 'app')    renderApps();
        if (tipo === 'tema')   renderTemas();
        if (tipo === 'widget') renderWidgets();
        return;
    }

    if (accion === 'carritoQuitar') {
        const tipo = (btnOrigen && btnOrigen.dataset.tipo) || 'app';
        carritoQuitar(tipo, id);
        renderCarritoBar();
        renderCarritoModal();
        if (tipo === 'app')    renderApps();
        if (tipo === 'tema')   renderTemas();
        if (tipo === 'widget') renderWidgets();
        return;
    }

    // --- Resto de acciones (async con lock) ---
    const clave = `${accion}:${id || 'x'}`;
    if (_accionesEnVuelo.has(clave)) return;
    _accionesEnVuelo.add(clave);

    let txtOriginal = '';
    if (btnOrigen) {
        btnOrigen.disabled = true;
        txtOriginal = btnOrigen.innerHTML;
        btnOrigen.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
        lucide.createIcons();
    }

    try {
        switch (accion) {
            case 'instalar':
                await api.instalar(id);
                toast('App agregada a tu sidebar', 'success');
                break;
            case 'desinstalar':
                await api.desinstalar(id);
                toast('App quitada de tu sidebar', 'success');
                break;
            case 'abrir':
                if (!api.estaInstalada(id)) await api.instalar(id);
                api.abrirApp(id);
                toast('Abriendo app...', 'info');
                break;
            case 'instalarTema':
                await api.instalarTema(id);
                toast('Tema instalado', 'success');
                break;
            case 'desinstalarTema':
                await api.desinstalarTema(id);
                toast('Tema desinstalado', 'success');
                break;
            case 'aplicarTema':
                await api.aplicarTema(id);
                toast('Tema por defecto actualizado', 'success');
                break;
            case 'instalarWidget':
                await api.instalarWidget(id);
                toast('Widget instalado', 'success');
                break;
            case 'desinstalarWidget':
                await api.desinstalarWidget(id);
                toast('Widget desinstalado', 'success');
                break;
            case 'comprarPaquete':
                if (!pz) throw new Error('PromoZione no disponible.');
                await pz.comprarPaquete(id);
                toast('¡Paquete desbloqueado!', 'success');
                break;
            case 'comprarOferta':
                if (!pz) throw new Error('PromoZione no disponible.');
                await pz.comprarOferta(extra.tipo, id, extra.descuento);
                toast('¡Oferta aprovechada!', 'success');
                break;
        }
        refrescarTodo();
    } catch (e) {
        toast(e.message || 'Error', 'error');
    } finally {
        _accionesEnVuelo.delete(clave);
        if (btnOrigen && document.body.contains(btnOrigen)) {
            btnOrigen.disabled = false;
            btnOrigen.innerHTML = txtOriginal;
            lucide.createIcons();
        }
    }
}

// Busca un item en el catálogo del shell por tipo+id
function _buscarItemPorId(tipo, id) {
    const api = API();
    if (!api) return null;
    if (tipo === 'app')    return (api.obtenerCatalogo() || []).find(x => x.id === id);
    if (tipo === 'tema')   return (api.obtenerTemas()    || []).find(x => x.id === id);
    if (tipo === 'widget') return (api.obtenerWidgets()  || []).find(x => x.id === id);
    return null;
}

function refrescarTodo() {
    limpiarCarritoInstalados();
    actualizarRecursos();
    renderAmpliacion();
    renderApps();
    renderTemas();
    renderWidgets();
    renderCarritoBar();

    const panelPromo = document.querySelector('.sh-panel[data-panel="promozione"]');
    if (panelPromo && (panelPromo.classList.contains('active') || panelPromo.dataset.visto === '1')) {
        renderPaquetes();
        renderOfertas();
    }
}

// ============================================================
//  TABS
// ============================================================
function inicializarTabs() {
    document.querySelectorAll('.sh-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sh-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sh-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`.sh-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) {
                panel.classList.add('active');
                panel.dataset.visto = '1';
            }

            _tabActual = tab.dataset.tab;
            _busquedaActual = '';
            const inputBuscador = document.getElementById('shSearch');
            if (inputBuscador) inputBuscador.value = '';
            const clrBuscador = document.getElementById('shSearchClear');
            if (clrBuscador) clrBuscador.style.display = 'none';
            actualizarBuscadorVisibilidad(_tabActual);

            if (_tabActual === 'promozione') {
                detenerTimerOfertas();
                renderPromoZione();
            } else {
                detenerTimerOfertas();
                if (_tabActual === 'apps')    renderApps();
                if (_tabActual === 'temas')   renderTemas();
                if (_tabActual === 'widgets') renderWidgets();
            }
        });
    });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    inicializarTabs();

    cargarCarrito();

    // -------- Delegado global para data-accion --------
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        e.preventDefault();
        if (btn.disabled) return;

        const extra = {};
        if (btn.dataset.tipo)      extra.tipo = btn.dataset.tipo;
        if (btn.dataset.descuento) extra.descuento = Number(btn.dataset.descuento);

        manejarAccion(btn.dataset.accion, btn.dataset.id, btn, extra);
    });

    // -------- Buscador --------
    const inputBuscador = document.getElementById('shSearch');
    const clrBuscador   = document.getElementById('shSearchClear');

    if (inputBuscador) {
        let _debounce = null;
        inputBuscador.addEventListener('input', () => {
            _busquedaActual = inputBuscador.value;
            if (clrBuscador) clrBuscador.style.display = _busquedaActual ? 'flex' : 'none';
            clearTimeout(_debounce);
            _debounce = setTimeout(() => {
                if (_tabActual === 'apps')    renderApps();
                if (_tabActual === 'temas')   renderTemas();
                if (_tabActual === 'widgets') renderWidgets();
            }, 120);
        });
    }

    if (clrBuscador) {
        clrBuscador.addEventListener('click', () => {
            if (inputBuscador) inputBuscador.value = '';
            _busquedaActual = '';
            clrBuscador.style.display = 'none';
            if (inputBuscador) inputBuscador.focus();
            if (_tabActual === 'apps')    renderApps();
            if (_tabActual === 'temas')   renderTemas();
            if (_tabActual === 'widgets') renderWidgets();
        });
    }

    // -------- Carrito --------
    const btnAbrir = document.getElementById('shCartOpen');
    if (btnAbrir) btnAbrir.addEventListener('click', abrirCarrito);

    const btnCerrarCart = document.getElementById('shCartClose');
    if (btnCerrarCart) btnCerrarCart.addEventListener('click', cerrarCarrito);

    const modalCart = document.getElementById('shCartModal');
    if (modalCart) {
        modalCart.addEventListener('click', (e) => {
            if (e.target === modalCart) cerrarCarrito();
        });
    }

    const btnVaciar = document.getElementById('shCartVaciar');
    if (btnVaciar) {
        btnVaciar.addEventListener('click', () => {
            if (!confirm('¿Vaciar el carrito? Se van a quitar todos los items.')) return;
            carritoVaciar();
            renderCarritoBar();
            renderCarritoModal();
            if (_tabActual === 'apps')    renderApps();
            if (_tabActual === 'temas')   renderTemas();
            if (_tabActual === 'widgets') renderWidgets();
            toast('Carrito vaciado', 'info');
        });
    }

    const btnComprar = document.getElementById('shCartComprar');
    if (btnComprar) btnComprar.addEventListener('click', comprarCarrito);

    // -------- Modal de ampliación --------
    const btnCloseAmp     = document.getElementById('shAmpClose');
    const btnCancelarAmp  = document.getElementById('shAmpCancelar');
    const btnConfirmarAmp = document.getElementById('shAmpConfirmar');
    const btnExitoCerrar  = document.getElementById('shAmpExitoCerrar');
    const modalAmp        = document.getElementById('shAmpModal');

    if (btnCloseAmp)      btnCloseAmp.addEventListener('click', cerrarModalEspacio);
    if (btnCancelarAmp)   btnCancelarAmp.addEventListener('click', cerrarModalEspacio);
    if (btnExitoCerrar)   btnExitoCerrar.addEventListener('click', cerrarModalEspacio);
    if (btnConfirmarAmp)  btnConfirmarAmp.addEventListener('click', ejecutarCompraEspacio);

    if (modalAmp) {
        modalAmp.addEventListener('click', (e) => {
            if (e.target === modalAmp && !_ampEnProgreso) cerrarModalEspacio();
        });
    }

    // -------- ESC --------
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // Prioridad: carrito primero si está abierto
        const cartModal = document.getElementById('shCartModal');
        if (cartModal && cartModal.style.display === 'flex') {
            cerrarCarrito();
            return;
        }

        // Ampliación
        if (!_ampEnProgreso) {
            const ampModal = document.getElementById('shAmpModal');
            if (ampModal && ampModal.style.display === 'flex') cerrarModalEspacio();
        }
    });

    // Visibilidad inicial del buscador
    actualizarBuscadorVisibilidad(_tabActual);

    setTimeout(() => {
        refrescarTodo();
        renderCarritoBar();
    }, 100);
});
