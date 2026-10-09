// ============================================================
//  HyperText — Extractor de proyectos para IA
//  ------------------------------------------------------------
//  · Recibe un .zip, lo escanea y muestra las carpetas raíz
//  · Permite seleccionar qué carpetas incluir
//  · Ordena jerárquicamente y genera 1 .txt o N partes en .zip
//  · Sin dependencias del shell (no necesita API ni ConfigBD)
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const EXTENSIONES_VALIDAS = ['.html', '.css', '.js'];

let finalBlob = null;
let finalFileName = '';
let zipFileName = 'extracted';
let currentZipData = null;
let allValidEntries = [];
let toastTimer = null;

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
    } catch (_) {}
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('htToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ht-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
//  LOG TERMINAL
// ============================================================
function log(mensaje, tipo = 'info') {
    const terminal = document.getElementById('logTerminal');
    if (!terminal) return;
    terminal.classList.add('active');

    const time = new Date().toLocaleTimeString('es-CL', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `ht-log-entry ht-${tipo}`;
    entry.innerHTML = `<span class="ht-timestamp">[${time}]</span><span>${escaparHTML(mensaje)}</span>`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

// ============================================================
//  DRAG & DROP + INPUT
// ============================================================
function bindDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
        e.target.value = '';
    });
}

// ============================================================
//  HANDLE FILE
// ============================================================
async function handleFile(file) {
    const dropZone = document.getElementById('dropZone');
    const dropTitle = document.getElementById('dropTitle');
    const dropSubtitle = document.getElementById('dropSubtitle');
    const folderPanel = document.getElementById('folderPanel');
    const downloadBtn = document.getElementById('downloadBtn');
    const logTerminal = document.getElementById('logTerminal');

    logTerminal.innerHTML = '';
    downloadBtn.classList.remove('visible');
    folderPanel.classList.remove('active');

    if (!file.name.toLowerCase().endsWith('.zip')) {
        log('Error: El archivo debe ser un .ZIP', 'error');
        toast('Solo se admiten archivos .ZIP', 'error');
        resetUI();
        return;
    }

    dropZone.classList.add('processing');
    dropTitle.innerHTML = `<span class="ht-spinner"></span> Escaneando estructura...`;
    dropSubtitle.textContent = 'Leyendo carpetas y archivos';

    zipFileName = file.name.replace(/\.zip$/i, '');

    try {
        log(`Cargando: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'info');
        currentZipData = await JSZip.loadAsync(file);

        allValidEntries = [];
        const folderStats = {};
        let rootCount = 0;
        let ignoredCount = 0;

        currentZipData.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return;
            const ext = '.' + relativePath.split('.').pop().toLowerCase();

            if (EXTENSIONES_VALIDAS.includes(ext)) {
                const parts = relativePath.split('/');
                if (parts.length > 1) {
                    const topFolder = parts[0];
                    folderStats[topFolder] = (folderStats[topFolder] || 0) + 1;
                } else {
                    rootCount++;
                }
                allValidEntries.push({ path: relativePath, ext, file: zipEntry });
            } else {
                ignoredCount++;
            }
        });

        log(`Escaneo completo: ${allValidEntries.length} válidos, ${ignoredCount} ignorados`, 'info');

        if (allValidEntries.length === 0) {
            log('Error: No se encontraron archivos .html, .css o .js', 'error');
            toast('No hay archivos válidos en el ZIP', 'error');
            resetUI();
            return;
        }

        // Construir UI de carpetas
        const folderList = document.getElementById('folderList');
        folderList.innerHTML = '';

        if (rootCount > 0) {
            folderList.appendChild(createFolderItem('Raíz (archivos sueltos)', rootCount, '__root__'));
        }

        const sortedFolders = Object.keys(folderStats).sort();
        for (const folder of sortedFolders) {
            folderList.appendChild(createFolderItem(folder, folderStats[folder], folder));
        }

        // Mostrar panel
        dropZone.classList.add('hidden');
        folderPanel.classList.add('active');
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        log(`Error crítico al leer ZIP: ${err.message}`, 'error');
        console.error(err);
        toast('No se pudo leer el ZIP', 'error');
        resetUI();
    }
}

function createFolderItem(name, count, value) {
    const item = document.createElement('label');
    item.className = 'ht-folder-item';
    item.innerHTML = `
        <input type="checkbox" class="ht-folder-checkbox" value="${escaparHTML(value)}" checked>
        <span class="ht-custom-checkbox"></span>
        <span class="ht-folder-name">${escaparHTML(name)}</span>
        <span class="ht-folder-count">${count} ${count === 1 ? 'archivo' : 'archivos'}</span>
    `;
    return item;
}

// ============================================================
//  PROCESAMIENTO
// ============================================================
async function processSelection() {
    const dropZone = document.getElementById('dropZone');
    const dropTitle = document.getElementById('dropTitle');
    const dropSubtitle = document.getElementById('dropSubtitle');
    const folderPanel = document.getElementById('folderPanel');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadText = document.getElementById('downloadText');

    folderPanel.classList.remove('active');
    dropZone.classList.remove('hidden');
    dropZone.classList.add('processing');
    dropTitle.innerHTML = `<span class="ht-spinner"></span> Procesando...`;
    dropSubtitle.textContent = 'Generando Hyper-Texto';

    const selectedFolders = Array.from(document.querySelectorAll('.ht-folder-checkbox:checked'))
        .map(cb => cb.value);
    const includeRoot = selectedFolders.includes('__root__');

    const filteredEntries = allValidEntries.filter(entry => {
        const parts = entry.path.split('/');
        if (parts.length === 1) return includeRoot;
        return selectedFolders.includes(parts[0]);
    });

    if (filteredEntries.length === 0) {
        log('Error: No seleccionaste ninguna carpeta con archivos válidos.', 'error');
        toast('Ninguna carpeta seleccionada', 'error');
        resetUI();
        return;
    }

    log(`Filtro aplicado: ${filteredEntries.length} archivos seleccionados`, 'warning');

    const splitMode = parseInt(document.getElementById('splitMode').value, 10);

    try {
        // Ordenamiento jerárquico (raíz primero, luego por profundidad y alfabético)
        filteredEntries.sort((a, b) => {
            const depthA = (a.path.match(/\//g) || []).length;
            const depthB = (b.path.match(/\//g) || []).length;
            if (depthA !== depthB) return depthA - depthB;
            return a.path.localeCompare(b.path);
        });
        log('Ordenamiento jerárquico aplicado (raíz primero)', 'info');

        if (splitMode === 1) {
            let output = generateHeader(zipFileName, filteredEntries.length, 1, 1);
            for (const entry of filteredEntries) {
                const content = await entry.file.async('string');
                output += `<file path="${entry.path}" type="${entry.ext.substring(1)}">\n${content}\n</file>\n\n`;
            }
            finalBlob = new Blob([output], { type: 'text/plain;charset=utf-8' });
            finalFileName = `${zipFileName}_hyper_text.txt`;
            log('Archivo único generado con éxito', 'success');
        } else {
            const actualParts = Math.min(splitMode, filteredEntries.length);
            const chunkSize = Math.ceil(filteredEntries.length / actualParts);
            const outputZip = new JSZip();

            log(`División inteligente activada: ${actualParts} partes`, 'warning');

            for (let i = 0; i < actualParts; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, filteredEntries.length);
                const chunkEntries = filteredEntries.slice(start, end);

                if (chunkEntries.length === 0) break;

                let partOutput = generateHeader(zipFileName, chunkEntries.length, actualParts, i + 1);
                for (const entry of chunkEntries) {
                    const content = await entry.file.async('string');
                    partOutput += `<file path="${entry.path}" type="${entry.ext.substring(1)}">\n${content}\n</file>\n\n`;
                }

                outputZip.file(`parte_${i + 1}.txt`, partOutput);
                log(`Parte ${i + 1}/${actualParts} generada (${chunkEntries.length} archivos)`, 'file');
            }

            log('Empaquetando partes en un nuevo .ZIP...', 'info');
            finalBlob = await outputZip.generateAsync({ type: 'blob' });
            finalFileName = `${zipFileName}_hyper_text_parts.zip`;
            log('¡Empaquetado completado!', 'success');
        }

        downloadText.textContent = splitMode === 1 ? 'Descargar archivo .TXT' : 'Descargar paquete .ZIP';
        downloadBtn.classList.add('visible');
        dropTitle.textContent = '¡Extracción completada!';
        dropSubtitle.textContent = `${filteredEntries.length} archivos procesados correctamente`;
        dropZone.classList.remove('processing');
        toast('Procesamiento completado', 'success');

    } catch (err) {
        log(`Error crítico: ${err.message}`, 'error');
        console.error(err);
        toast('Error al procesar', 'error');
        resetUI();
    }
}

function generateHeader(projectName, fileCount, totalParts, currentPart) {
    let header = `=====================================================\n`;
    header += `// HYPER TEXT EXTRACTOR - AI READY FILE\n`;
    header += `// Proyecto: ${projectName}\n`;
    header += `// Fecha: ${new Date().toLocaleString('es-CL')}\n`;
    if (totalParts > 1) {
        header += `// PARTE ${currentPart} DE ${totalParts}\n`;
    }
    header += `// Archivos en este bloque: ${fileCount}\n`;
    header += `=====================================================\n\n`;
    return header;
}

function resetUI() {
    const dropZone = document.getElementById('dropZone');
    const dropTitle = document.getElementById('dropTitle');
    const dropSubtitle = document.getElementById('dropSubtitle');
    const folderPanel = document.getElementById('folderPanel');

    dropZone.classList.remove('processing', 'hidden');
    folderPanel.classList.remove('active');
    dropTitle.textContent = 'Arrastrá tu archivo .ZIP aquí';
    dropSubtitle.textContent = 'o hacé clic para seleccionarlo';
}

// ============================================================
//  DESCARGA
// ============================================================
function descargar() {
    if (!finalBlob) return;
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 800);
    log(`Descarga iniciada: ${finalFileName}`, 'success');
    toast('Descargando ' + finalFileName, 'success');
}

// ============================================================
//  BIND UI
// ============================================================
function bindUI() {
    bindDropZone();

    document.getElementById('selectAllBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.ht-folder-checkbox').forEach(cb => cb.checked = true);
    });
    document.getElementById('deselectAllBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.ht-folder-checkbox').forEach(cb => cb.checked = false);
    });
    document.getElementById('confirmSelectionBtn')?.addEventListener('click', processSelection);
    document.getElementById('downloadBtn')?.addEventListener('click', descargar);
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    const api = window.parent.__vicwebos || null;
    const usuario = api?.obtenerCuenta?.() || { codigo: 'anon' };
    const badge = document.getElementById('htUserBadge');
    if (badge) {
        badge.textContent = usuario?.codigo ? `@${usuario.codigo}` : '—';
    }

    bindUI();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
