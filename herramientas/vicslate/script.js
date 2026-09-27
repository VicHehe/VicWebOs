// ============================================================
//  Vicslate — Traductor de texto
//  ------------------------------------------------------------
//  · Motor primario: MyMemory (gratis, sin key, ~5000 palabras/día)
//  · Motor secundario: Google Translate (endpoint no oficial)
//  · El idioma de origen en modo "Detectar" lo resuelve el motor.
//  · Historial y favoritos en localStorage (per-usuario).
//  · Sin dependencias externas (solo fetch + Lucide CDN).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MAX_CHARS = 5000;
const MAX_HISTORIAL = 50;
const DEBOUNCE_MS = 500;
const LS_HISTORIAL = 'vicslate_historial_';
const LS_FAVORITOS = 'vicslate_favoritos_';

// ---------- ESTADO ----------
let usuarioActual = null;
let historial = [];
let favoritos = [];
let debounceTimer = null;
let traduciendo = false;
let ultimaTraduccion = null;   // { from, to, sourceText, translatedText, motor }
let toastTimer = null;
let tabActual = 'historial';

const API = () => window.parent.__vicwebos || null;

// ---------- IDIOMAS ----------
// MyMemory y Google usan códigos ISO-639-1 casi idénticos.
const IDIOMAS = [
    { code: 'auto', nombre: 'Detectar',      flag: '🔍' },
    { code: 'es',   nombre: 'Español',       flag: '🇪🇸' },
    { code: 'en',   nombre: 'Inglés',        flag: '🇬🇧' },
    { code: 'fr',   nombre: 'Francés',       flag: '🇫🇷' },
    { code: 'de',   nombre: 'Alemán',        flag: '🇩🇪' },
    { code: 'it',   nombre: 'Italiano',      flag: '🇮🇹' },
    { code: 'pt',   nombre: 'Portugués',     flag: '🇵🇹' },
    { code: 'ru',   nombre: 'Ruso',          flag: '🇷🇺' },
    { code: 'ja',   nombre: 'Japonés',       flag: '🇯🇵' },
    { code: 'ko',   nombre: 'Coreano',       flag: '🇰🇷' },
    { code: 'zh',   nombre: 'Chino',         flag: '🇨🇳' },
    { code: 'ar',   nombre: 'Árabe',         flag: '🇸🇦' },
    { code: 'he',   nombre: 'Hebreo',        flag: '🇮🇱' },
    { code: 'nl',   nombre: 'Neerlandés',    flag: '🇳🇱' },
    { code: 'pl',   nombre: 'Polaco',        flag: '🇵🇱' },
    { code: 'sv',   nombre: 'Sueco',         flag: '🇸🇪' },
    { code: 'no',   nombre: 'Noruego',       flag: '🇳🇴' },
    { code: 'da',   nombre: 'Danés',         flag: '🇩🇰' },
    { code: 'fi',   nombre: 'Finés',         flag: '🇫🇮' },
    { code: 'tr',   nombre: 'Turco',         flag: '🇹🇷' },
    { code: 'hu',   nombre: 'Húngaro',       flag: '🇭🇺' },
    { code: 'cs',   nombre: 'Checo',         flag: '🇨🇿' },
    { code: 'el',   nombre: 'Griego',        flag: '🇬🇷' },
    { code: 'bg',   nombre: 'Búlgaro',       flag: '🇧🇬' },
    { code: 'ro',   nombre: 'Rumano',        flag: '🇷🇴' },
    { code: 'sk',   nombre: 'Eslovaco',      flag: '🇸🇰' },
    { code: 'sl',   nombre: 'Esloveno',      flag: '🇸🇮' },
    { code: 'hr',   nombre: 'Croata',        flag: '🇭🇷' },
    { code: 'sr',   nombre: 'Serbio',        flag: '🇷🇸' },
    { code: 'uk',   nombre: 'Ucraniano',     flag: '🇺🇦' },
    { code: 'lt',   nombre: 'Lituano',       flag: '🇱🇹' },
    { code: 'lv',   nombre: 'Letón',         flag: '🇱🇻' },
    { code: 'et',   nombre: 'Estonio',       flag: '🇪🇪' },
    { code: 'id',   nombre: 'Indonesio',     flag: '🇮🇩' },
    { code: 'ms',   nombre: 'Malayo',        flag: '🇲🇾' },
    { code: 'th',   nombre: 'Tailandés',     flag: '🇹🇭' },
    { code: 'vi',   nombre: 'Vietnamita',    flag: '🇻🇳' }
];

const idiomaPorCodigo = (code) => IDIOMAS.find(i => i.code === code);

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const dom = {
    userBadge: $('traUserBadge'),
    langFrom: $('langFrom'),
    langTo: $('langTo'),
    langFromLabel: $('langFromLabel'),
    langToLabel: $('langToLabel'),
    btnSwap: $('btnSwap'),
    btnLimpiar: $('btnLimpiar'),
    chkCompare: $('chkCompare'),
    textFrom: $('textFrom'),
    charCount: $('charCount'),
    resultCard: $('resultCard'),
    resultText: $('resultText'),
    engineInfo: $('engineInfo'),
    btnCopy: $('btnCopy'),
    btnFav: $('btnFav'),
    compareCard: $('compareCard'),
    resultText2: $('resultText2'),
    engineInfo2: $('engineInfo2'),
    tabContent: $('tabContent'),
    toast: $('traToast')
};

// ============================================================
//  TEMA DEL SHELL
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
            '--shadow-glow',
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
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    if (!dom.toast) return;
    dom.toast.textContent = texto;
    dom.toast.className = 'tra-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2400);
}

function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function claveStorage(sufijo) {
    const codigo = usuarioActual?.codigo || 'anon';
    return sufijo + codigo;
}

// ============================================================
//  LLENAR SELECTS DE IDIOMA
// ============================================================
function llenarSelectores() {
    const optFrom = IDIOMAS.map(i =>
        `<option value="${i.code}">${i.flag} ${i.nombre}</option>`
    ).join('');
    dom.langFrom.innerHTML = optFrom;

    const optTo = IDIOMAS.filter(i => i.code !== 'auto').map(i =>
        `<option value="${i.code}">${i.flag} ${i.nombre}</option>`
    ).join('');
    dom.langTo.innerHTML = optTo;

    dom.langFrom.value = 'auto';
    dom.langTo.value = 'en';

    actualizarEtiquetas();
}

function actualizarEtiquetas() {
    const from = idiomaPorCodigo(dom.langFrom.value);
    const to = idiomaPorCodigo(dom.langTo.value);
    dom.langFromLabel.textContent = from ? from.nombre : '—';
    dom.langToLabel.textContent = to ? to.nombre : '—';
}

// ============================================================
//  MOTORES DE TRADUCCIÓN
// ============================================================

// -------- MyMemory --------
async function traducirMyMemory(texto, from, to) {
    const par = from === 'auto' ? `auto|${to}` : `${from}|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=${par}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory error ${res.status}`);

    const data = await res.json();

    // MyMemory a veces devuelve 200 con responseStatus 403/429
    const status = parseInt(data.responseStatus, 10);
    if (status !== 200) {
        throw new Error(data.responseDetails || `MyMemory ${status}`);
    }

    const traduccion = data.responseData?.translatedText;
    if (!traduccion) throw new Error('MyMemory no devolvió traducción');

    return traduccion;
}

// -------- Google Translate (endpoint no oficial) --------
async function traducirGoogle(texto, from, to) {
    const params = new URLSearchParams({
        client: 'gtx',
        sl: from === 'auto' ? 'auto' : from,
        tl: to,
        dt: 't',
        q: texto
    });

    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
    if (!res.ok) throw new Error(`Google error ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) throw new Error('Google: respuesta inválida');

    // data[0] es un array de fragmentos traducidos
    const texto_trad = data[0]
        .filter(f => Array.isArray(f) && typeof f[0] === 'string')
        .map(f => f[0])
        .join('');

    if (!texto_trad) throw new Error('Google no devolvió traducción');

    return texto_trad;
}

// -------- Traducción con fallback --------
async function traducirConFallback(texto, from, to, motorForzado = null) {
    const motores = [
        { id: 'mymemory', nombre: 'MyMemory',         fn: traducirMyMemory },
        { id: 'google',   nombre: 'Google Translate', fn: traducirGoogle }
    ];

    if (motorForzado) {
        const m = motores.find(x => x.id === motorForzado);
        if (!m) throw new Error(`Motor desconocido: ${motorForzado}`);
        return { texto: await m.fn(texto, from, to), motor: m.nombre, motorId: m.id };
    }

    let ultimoError = null;
    for (const m of motores) {
        try {
            const texto_trad = await m.fn(texto, from, to);
            return { texto: texto_trad, motor: m.nombre, motorId: m.id };
        } catch (e) {
            console.warn(`[Vicslate] ${m.nombre} falló:`, e.message);
            ultimoError = e;
        }
    }
    throw ultimoError || new Error('Todos los motores fallaron');
}

// ============================================================
//  TRADUCCIÓN
// ============================================================
async function ejecutarTraduccion() {
    if (traduciendo) return;

    const texto = dom.textFrom.value.trim();

    if (!texto) {
        resetResultado();
        return;
    }

    traduciendo = true;

    const from = dom.langFrom.value;
    const to = dom.langTo.value;

    // Estado: cargando
    dom.resultText.innerHTML = '<span class="tra-loading">Traduciendo...</span>';
    dom.resultText.className = 'tra-result tra-loading';
    dom.engineInfo.textContent = '...';

    // Si está el comparador activado y ya hay una traducción previa, ocultar
    if (dom.chkCompare.checked) {
        dom.compareCard.hidden = false;
        dom.resultText2.innerHTML = '<span class="tra-placeholder">Esperando...</span>';
        dom.resultText2.className = 'tra-result';
        dom.engineInfo2.textContent = '...';
    }

    try {
        // Traducción principal
        const { texto: traduccion, motor, motorId } = await traducirConFallback(texto, from, to);

        dom.resultText.textContent = traduccion;
        dom.resultText.className = 'tra-result';
        dom.engineInfo.textContent = motor;

        // Guardar en historial (dedupe: si es la última misma traducción, no duplicar)
        const entrada = {
            from: texto,
            to: traduccion,
            motor,
            sourceLang: from,
            targetLang: to,
            fecha: new Date().toISOString()
        };

        const ultima = historial[0];
        if (!ultima || ultima.from !== entrada.from || ultima.to !== entrada.to || ultima.targetLang !== entrada.targetLang) {
            historial.unshift(entrada);
            if (historial.length > MAX_HISTORIAL) historial = historial.slice(0, MAX_HISTORIAL);
            guardarHistorial();
            if (tabActual === 'historial') renderizarTab();
        }

        // Guardar la última traducción completa
        ultimaTraduccion = {
            sourceText: texto,
            translatedText: traduccion,
            motor,
            motorId,
            from,
            to
        };

        // Comparador
        if (dom.chkCompare.checked) {
            const otroMotorId = motorId === 'mymemory' ? 'google' : 'mymemory';
            try {
                const { texto: trad2, motor: motor2 } = await traducirConFallback(texto, from, to, otroMotorId);
                dom.resultText2.textContent = trad2;
                dom.resultText2.className = 'tra-result';
                dom.engineInfo2.textContent = motor2;
            } catch (e) {
                dom.resultText2.textContent = 'El segundo motor no está disponible en este momento.';
                dom.resultText2.className = 'tra-result tra-error';
                dom.engineInfo2.textContent = 'Error';
            }
        }

    } catch (e) {
        console.warn('[Vicslate] Error:', e);
        dom.resultText.textContent = 'No se pudo traducir. Probá de nuevo en un momento.';
        dom.resultText.className = 'tra-result tra-error';
        dom.engineInfo.textContent = 'Error';
        ultimaTraduccion = null;
    } finally {
        traduciendo = false;
    }
}

function resetResultado() {
    dom.resultText.innerHTML = '<span class="tra-placeholder">La traducción aparecerá aquí...</span>';
    dom.resultText.className = 'tra-result';
    dom.engineInfo.textContent = '—';
    dom.resultText2.innerHTML = '<span class="tra-placeholder">Traducción alternativa...</span>';
    dom.engineInfo2.textContent = '—';
    dom.compareCard.hidden = !dom.chkCompare.checked;
    ultimaTraduccion = null;
    dom.btnFav.classList.remove('favorito');
}

function traducirConDebounce() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(ejecutarTraduccion, DEBOUNCE_MS);
}

// ============================================================
//  HISTORIAL Y FAVORITOS
// ============================================================
function guardarHistorial() {
    try { localStorage.setItem(claveStorage(LS_HISTORIAL), JSON.stringify(historial)); } catch (_) {}
}
function cargarHistorial() {
    try {
        const raw = localStorage.getItem(claveStorage(LS_HISTORIAL));
        historial = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(historial)) historial = [];
    } catch (_) { historial = []; }
}

function guardarFavoritos() {
    try { localStorage.setItem(claveStorage(LS_FAVORITOS), JSON.stringify(favoritos)); } catch (_) {}
}
function cargarFavoritos() {
    try {
        const raw = localStorage.getItem(claveStorage(LS_FAVORITOS));
        favoritos = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(favoritos)) favoritos = [];
    } catch (_) { favoritos = []; }
}

function renderizarTab() {
    if (tabActual === 'historial') renderHistorial();
    else renderFavoritos();
}

function renderHistorial() {
    if (historial.length === 0) {
        dom.tabContent.innerHTML = `
            <div class="tra-vacio">
                <i data-lucide="history"></i>
                <span>Aún no hay traducciones</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    dom.tabContent.innerHTML = `<div class="tra-list">${historial.map((item, idx) => `
        <div class="tra-item" data-idx="${idx}" data-tipo="historial">
            <div class="tra-item-texto">
                <span class="tra-item-from" title="${escaparHTML(item.from)}">${escaparHTML(recortar(item.from, 60))}</span>
                <span class="tra-item-to" title="${escaparHTML(item.to)}">${escaparHTML(recortar(item.to, 60))}</span>
            </div>
            <div class="tra-item-acciones">
                <button class="tra-item-btn" data-accion="copy" title="Copiar traducción">
                    <i data-lucide="copy"></i>
                </button>
                <button class="tra-item-btn" data-accion="fav" title="Guardar en favoritos">
                    <i data-lucide="star"></i>
                </button>
                <button class="tra-item-btn peligro" data-accion="del" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('')}</div>`;

    cablearItems('historial');
    if (window.lucide) window.lucide.createIcons();
}

function renderFavoritos() {
    if (favoritos.length === 0) {
        dom.tabContent.innerHTML = `
            <div class="tra-vacio">
                <i data-lucide="star"></i>
                <span>Aún no tenés favoritos</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    dom.tabContent.innerHTML = `<div class="tra-list">${favoritos.map((item, idx) => `
        <div class="tra-item" data-idx="${idx}" data-tipo="favoritos">
            <div class="tra-item-texto">
                <span class="tra-item-from" title="${escaparHTML(item.from)}">${escaparHTML(recortar(item.from, 60))}</span>
                <span class="tra-item-to" title="${escaparHTML(item.to)}">${escaparHTML(recortar(item.to, 60))}</span>
            </div>
            <div class="tra-item-acciones">
                <button class="tra-item-btn" data-accion="copy" title="Copiar traducción">
                    <i data-lucide="copy"></i>
                </button>
                <button class="tra-item-btn peligro" data-accion="del" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('')}</div>`;

    cablearItems('favoritos');
    if (window.lucide) window.lucide.createIcons();
}

function cablearItems(tipo) {
    const lista = tipo === 'historial' ? historial : favoritos;

    dom.tabContent.querySelectorAll('.tra-item').forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        const item = lista[idx];
        if (!item) return;

        // Click en el cuerpo del item → cargar en el textarea
        el.addEventListener('click', (e) => {
            if (e.target.closest('.tra-item-btn')) return;
            dom.textFrom.value = item.from;
            dom.charCount.textContent = item.from.length;
            // Si el item guarda los idiomas, los usamos
            if (item.sourceLang) dom.langFrom.value = item.sourceLang;
            if (item.targetLang) dom.langTo.value = item.targetLang;
            actualizarEtiquetas();
            // Traducir inmediatamente
            clearTimeout(debounceTimer);
            ejecutarTraduccion();
        });
    });

    dom.tabContent.querySelectorAll('.tra-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.tra-item');
            const idx = parseInt(item.dataset.idx, 10);
            const accion = btn.dataset.accion;

            if (accion === 'copy') {
                copiarAlPortapapeles(lista[idx].to);
            }
            if (accion === 'fav') {
                agregarFavorito(lista[idx]);
            }
            if (accion === 'del') {
                lista.splice(idx, 1);
                if (tipo === 'historial') guardarHistorial();
                else guardarFavoritos();
                renderizarTab();
            }
        });
    });
}

function agregarFavorito(item) {
    const existe = favoritos.some(f => f.from === item.from && f.to === item.to && f.targetLang === item.targetLang);
    if (existe) {
        toast('Ya está en favoritos', 'info');
        return;
    }
    favoritos.unshift({
        from: item.from,
        to: item.to,
        motor: item.motor,
        sourceLang: item.sourceLang,
        targetLang: item.targetLang,
        fecha: new Date().toISOString()
    });
    guardarFavoritos();
    if (tabActual === 'favoritos') renderizarTab();
    toast('Guardado en favoritos', 'success');
}

function recortar(texto, max) {
    const t = String(texto || '');
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// ============================================================
//  COPIAR
// ============================================================
async function copiarAlPortapapeles(texto) {
    if (!texto) return;
    let ok = false;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
            ok = true;
        }
    } catch (_) { /* fallback */ }

    if (!ok) {
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            ok = true;
        } catch (_) { ok = false; }
    }

    if (ok) {
        // Feedback visual en el botón (si es el de la card destino)
        const btn = dom.btnCopy;
        const original = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check"></i><span>Copiado</span>';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = original;
            if (window.lucide) window.lucide.createIcons();
        }, 1400);
    } else {
        toast('No se pudo copiar', 'error');
    }
}

// ============================================================
//  ACCIONES
// ============================================================
function limpiarTodo() {
    dom.textFrom.value = '';
    dom.charCount.textContent = '0';
    dom.langFrom.value = 'auto';
    dom.langTo.value = 'en';
    actualizarEtiquetas();
    resetResultado();
    clearTimeout(debounceTimer);
    dom.textFrom.focus();
}

function swapIdiomas() {
    const from = dom.langFrom.value;
    const to = dom.langTo.value;
    if (from === 'auto') {
        toast('No se puede intercambiar con "Detectar"', 'info');
        return;
    }
    dom.langFrom.value = to;
    dom.langTo.value = from;
    actualizarEtiquetas();

    // Intercambiar también el contenido si hay traducción
    if (ultimaTraduccion) {
        dom.textFrom.value = ultimaTraduccion.translatedText;
        dom.charCount.textContent = dom.textFrom.value.length;
    }

    if (dom.textFrom.value.trim()) ejecutarTraduccion();
}

// ============================================================
//  EVENTOS
// ============================================================
function bindEventos() {
    dom.textFrom.addEventListener('input', () => {
        dom.charCount.textContent = dom.textFrom.value.length;
        traducirConDebounce();
    });

    dom.langFrom.addEventListener('change', () => {
        actualizarEtiquetas();
        if (dom.textFrom.value.trim()) ejecutarTraduccion();
    });

    dom.langTo.addEventListener('change', () => {
        actualizarEtiquetas();
        if (dom.textFrom.value.trim()) ejecutarTraduccion();
    });

    dom.btnSwap.addEventListener('click', swapIdiomas);
    dom.btnLimpiar.addEventListener('click', limpiarTodo);

    dom.chkCompare.addEventListener('change', () => {
        if (dom.chkCompare.checked) {
            dom.compareCard.hidden = false;
            if (dom.textFrom.value.trim()) ejecutarTraduccion();
        } else {
            dom.compareCard.hidden = true;
        }
    });

    dom.btnCopy.addEventListener('click', () => {
        if (ultimaTraduccion && ultimaTraduccion.translatedText) {
            copiarAlPortapapeles(ultimaTraduccion.translatedText);
        }
    });

    dom.btnFav.addEventListener('click', () => {
        if (!ultimaTraduccion) return;
        agregarFavorito({
            from: ultimaTraduccion.sourceText,
            to: ultimaTraduccion.translatedText,
            motor: ultimaTraduccion.motor,
            sourceLang: ultimaTraduccion.from,
            targetLang: ultimaTraduccion.to,
            fecha: new Date().toISOString()
        });
        dom.btnFav.classList.add('favorito');
        setTimeout(() => dom.btnFav.classList.remove('favorito'), 1600);
    });

    // Tabs
    document.querySelectorAll('.tra-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tra-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            renderizarTab();
        });
    });

    // Ctrl+Enter para forzar traducción sin esperar el debounce
    dom.textFrom.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimer);
            ejecutarTraduccion();
        }
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    // Usuario
    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || null;

    if (dom.userBadge) {
        dom.userBadge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : 'Invitado';
    }

    // Cargar datos persistidos
    cargarHistorial();
    cargarFavoritos();

    // UI
    llenarSelectores();
    resetResultado();
    renderizarTab();
    bindEventos();

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => dom.textFrom.focus(), 100);
}

document.addEventListener('DOMContentLoaded', inicializar);