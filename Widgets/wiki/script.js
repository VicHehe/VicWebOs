// ============================================================
//  Widget: Wiki Lector
//  ------------------------------------------------------------
//  Buscador y lector rápido conectando a la API de Wikipedia.
//  Diseñado para integrarse en iframes de VicWebOS.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
let inicializado = false;

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
    } catch (e) { /* silencioso si falla el acceso cross-origin */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  LÓGICA WIKIPEDIA
// ============================================================
const DOM = {
    input: document.getElementById('wikiInput'),
    btnSearch: document.getElementById('wikiBtnSearch'),
    zona: document.getElementById('wikiZona')
};

function setEstado(tipo, texto = '') {
    if (tipo === 'cargando') {
        DOM.zona.innerHTML = `
            <div class="wiki-estado">
                <i data-lucide="loader-2" style="animation: spin 1s linear infinite;"></i>
                <p>Buscando en la enciclopedia...</p>
            </div>
        `;
    } else if (tipo === 'error') {
        DOM.zona.innerHTML = `
            <div class="wiki-estado error">
                <i data-lucide="alert-circle"></i>
                <p>${texto}</p>
            </div>
        `;
    } else if (tipo === 'vacio') {
        DOM.zona.innerHTML = `
            <div class="wiki-estado">
                <i data-lucide="compass"></i>
                <p>Busca un concepto, lugar o personaje histórico para empezar.</p>
            </div>
        `;
    }
    
    if (window.lucide) window.lucide.createIcons();
    
    if (!document.getElementById('wikiSpin')) {
        const style = document.createElement('style');
        style.id = 'wikiSpin';
        style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
}

async function buscarEnWikipedia(query) {
    if (!query.trim()) {
        setEstado('vacio');
        return;
    }

    DOM.input.disabled = true;
    DOM.btnSearch.disabled = true;
    setEstado('cargando');

    try {
        const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.query.search || searchData.query.search.length === 0) {
            setEstado('error', 'No se encontraron artículos con esa búsqueda.');
            return;
        }

        const tituloExacto = searchData.query.search[0].title;
        const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tituloExacto)}`;
        const summaryRes = await fetch(summaryUrl);
        const summaryData = await summaryRes.json();

        renderizarArticulo(summaryData);

    } catch (error) {
        setEstado('error', 'Hubo un error al conectar con Wikipedia.');
    } finally {
        DOM.input.disabled = false;
        DOM.btnSearch.disabled = false;
        DOM.input.focus();
    }
}

function renderizarArticulo(data) {
    const imagen = data.thumbnail 
        ? `<img src="${data.thumbnail.source}" class="wiki-img" alt="${data.title}">` 
        : '';
    
    const descripcion = data.description 
        ? `<div class="wiki-art-desc">${data.description}</div>` 
        : '';
        
    const link = data.content_urls && data.content_urls.desktop 
        ? data.content_urls.desktop.page 
        : `https://es.wikipedia.org/wiki/${encodeURIComponent(data.title)}`;

    DOM.zona.innerHTML = `
        <div class="wiki-articulo">
            ${imagen}
            <h3 class="wiki-art-titulo">${data.title}</h3>
            ${descripcion}
            <p class="wiki-art-texto">${data.extract}</p>
            <a href="${link}" target="_blank" class="wiki-link">
                Leer en Wikipedia <i data-lucide="external-link"></i>
            </a>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    DOM.zona.scrollTop = 0; 
}

// ============================================================
//  INIT
// ============================================================
function inicializarEventos() {
    const dispararBusqueda = () => {
        const val = DOM.input.value.trim();
        if (val) buscarEnWikipedia(val);
    };

    DOM.btnSearch.addEventListener('click', dispararBusqueda);
    DOM.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') dispararBusqueda();
    });
}

function inicializar() {
    if (inicializado) return;
    inicializado = true;
    aplicarTemaDelPadre();
    inicializarEventos();
    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
