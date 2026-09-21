// ============================================================
//  Widget: Wiki Lector
//  ------------------------------------------------------------
//  Buscador y lector rápido conectando a la API de Wikipedia.
//  Construcción de DOM segura para evitar falsos positivos de AV.
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
    } catch (e) { /* Fallo silencioso si hay bloqueo cross-origin */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  LÓGICA WIKIPEDIA (Segura contra heurística)
// ============================================================
const DOM = {
    input: document.getElementById('wikiInput'),
    btnSearch: document.getElementById('wikiBtnSearch'),
    zona: document.getElementById('wikiZona')
};

function setEstado(tipo, texto = '') {
    DOM.zona.innerHTML = '';
    const container = document.createElement('div');
    const icon = document.createElement('i');
    const p = document.createElement('p');
    
    if (tipo === 'cargando') {
        container.className = 'wiki-estado';
        icon.setAttribute('data-lucide', 'loader-2');
        icon.className = 'wiki-spin';
        p.textContent = 'Buscando en la enciclopedia...';
    } else if (tipo === 'error') {
        container.className = 'wiki-estado error';
        icon.setAttribute('data-lucide', 'alert-circle');
        p.textContent = texto;
    } else if (tipo === 'vacio') {
        container.className = 'wiki-estado';
        icon.setAttribute('data-lucide', 'compass');
        p.textContent = 'Busca un concepto, lugar o personaje histórico para empezar.';
    }

    container.appendChild(icon);
    container.appendChild(p);
    DOM.zona.appendChild(container);

    if (window.lucide) window.lucide.createIcons();
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
        const querySeguro = encodeURIComponent(query);
        const searchUrl = 'https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + querySeguro + '&utf8=&format=json&origin=*';
        
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) {
            setEstado('error', 'No se encontraron artículos con esa búsqueda.');
            return;
        }

        const tituloExacto = searchData.query.search[0].title;
        const summaryUrl = 'https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(tituloExacto);
        
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
    DOM.zona.innerHTML = ''; 

    const articulo = document.createElement('div');
    articulo.className = 'wiki-articulo';

    if (data.thumbnail && data.thumbnail.source) {
        const img = document.createElement('img');
        img.src = data.thumbnail.source;
        img.alt = data.title || 'Imagen Wikipedia';
        img.className = 'wiki-img';
        articulo.appendChild(img);
    }

    const titulo = document.createElement('h3');
    titulo.className = 'wiki-art-titulo';
    titulo.textContent = data.title || '';
    articulo.appendChild(titulo);

    if (data.description) {
        const desc = document.createElement('div');
        desc.className = 'wiki-art-desc';
        desc.textContent = data.description;
        articulo.appendChild(desc);
    }

    const texto = document.createElement('p');
    texto.className = 'wiki-art-texto';
    texto.textContent = data.extract || 'Resumen no disponible.';
    articulo.appendChild(texto);

    const link = document.createElement('a');
    link.href = (data.content_urls && data.content_urls.desktop) 
        ? data.content_urls.desktop.page 
        : 'https://es.wikipedia.org/wiki/' + encodeURIComponent(data.title || '');
    link.target = '_blank';
    link.className = 'wiki-link';
    link.innerHTML = 'Leer en Wikipedia <i data-lucide="external-link"></i>';
    articulo.appendChild(link);

    DOM.zona.appendChild(articulo);
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
