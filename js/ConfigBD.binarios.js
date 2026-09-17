// ============================================================
//  ConfigBD.binarios.js
//  ------------------------------------------------------------
//  Extiende ConfigBD con subida y lectura de archivos binarios
//  (imágenes, audio, video, documentos) contra el repo de datos
//  en GitHub.
//
//  Se carga DESPUÉS de ConfigBD.js:
//      <script src="js/ConfigBD.js"></script>
//      <script src="js/ConfigBD.binarios.js"></script>
//
//  API que añade a ConfigBD:
//      ConfigBD.subirArchivo(path, fileOrBlob, opciones)
//      ConfigBD.leerArchivoBinario(path, opciones)        → Blob
//      ConfigBD.leerArchivoBinarioComoURL(path, opciones) → string (blob:)
//      ConfigBD.existeArchivo(path, opciones)             → bool
//      ConfigBD.eliminarArchivo(path, opciones)
//      ConfigBD.MAX_ARCHIVO_BINARIO                       → int
//
//  El desarrollador de la app NUNCA ve base64. Sube un File
//  nativo del navegador y recibe Blob/URL al leer.
//
//  Internamente elige entre dos rutas según el tamaño:
//    - ≤ 900 KB  → Contents API (1 request)
//    - ≤ 50 MB   → Git Data API (6 requests, con reintentos)
// ============================================================

(function () {
    'use strict';

    // ------------------------------------------------------------
    //  Constantes
    // ------------------------------------------------------------
    const UMBRAL_CONTENTS = 900 * 1024;        // 900 KB
    const MAX_ARCHIVO     = 50 * 1024 * 1024;  // 50 MB (autoimpuesto)
    const MAX_REINTENTOS  = 3;

    // Caché de la rama por defecto del repo (main/master)
    let _ramaCache = null;

    // ------------------------------------------------------------
    //  Utilidades internas
    // ------------------------------------------------------------

    // Uint8Array → base64 por chunks de 32 KB (evita stack overflow)
    function bytesABase64(bytes) {
        const CHUNK = 0x8000;
        let binario = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binario += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binario);
    }

    // Normaliza cualquier entrada a Uint8Array
    async function aBytes(fileOrBlob) {
        if (fileOrBlob instanceof Uint8Array) return fileOrBlob;
        if (fileOrBlob instanceof ArrayBuffer) return new Uint8Array(fileOrBlob);
        if (typeof Blob !== 'undefined' && fileOrBlob instanceof Blob) {
            return new Uint8Array(await fileOrBlob.arrayBuffer());
        }
        throw new Error('Se esperaba un File, Blob, ArrayBuffer o Uint8Array.');
    }

    // Lee la rama por defecto del repo (cacheada). Se resetea al
    // desconectar o si una escritura da conflicto.
    async function obtenerRamaDefault() {
        if (_ramaCache) return _ramaCache;

        const config = cargarConfigBD();
        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
            { headers: GH_HEADERS(config.githubToken) }
        );
        if (!res.ok) throw new Error('No se pudo leer la info del repositorio.');
        const data = await res.json();
        _ramaCache = data.default_branch || 'main';
        return _ramaCache;
    }

    // Detecta si un error indica conflicto de escritura (para reintentar)
    function esConflicto(mensaje) {
        if (!mensaje) return false;
        const m = String(mensaje).toLowerCase();
        return m.includes('409') ||
               m.includes('422') ||
               m.includes('conflict') ||
               m.includes('update is not a fast forward') ||
               m.includes('does not match');
    }

    function esperar(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ------------------------------------------------------------
    //  RUTA A — Contents API (≤ 900 KB)
    // ------------------------------------------------------------
    async function subirViaContents(path, bytes, signal) {
        const config = cargarConfigBD();

        // ¿Existe ya? Si sí, necesitamos su sha para sobrescribir.
        let sha = null;
        try {
            const res = await fetch(
                `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
                { headers: GH_HEADERS(config.githubToken), signal }
            );
            if (res.ok) {
                const data = await res.json();
                sha = data.sha || null;
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            // 404 u otro → seguimos sin sha (creación nueva)
        }

        const body = {
            message: `Subir ${path}`,
            content: bytesABase64(bytes),
            ...(sha ? { sha } : {})
        };

        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
            {
                method: 'PUT',
                headers: {
                    ...GH_HEADERS(config.githubToken),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Error subiendo ${path}.`);
        }
        return await res.json();
    }

    // ------------------------------------------------------------
    //  RUTA B — Git Data API (≤ 50 MB, con reintentos en conflicto)
    // ------------------------------------------------------------
    async function subirViaGitData(path, bytes, signal, intento = 1) {
        const config = cargarConfigBD();
        const token = config.githubToken;
        const owner = config.githubOwner;
        const repo  = config.githubRepo;
        const rama  = await obtenerRamaDefault();

        try {
            // 1. SHA del HEAD de la rama
            const refRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${rama}`,
                { headers: GH_HEADERS(token), signal }
            );
            if (!refRes.ok) throw new Error(`No se pudo leer la rama ${rama}.`);
            const { object: { sha: commitSha } } = await refRes.json();

            // 2. SHA del tree base de ese commit
            const commitRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
                { headers: GH_HEADERS(token), signal }
            );
            if (!commitRes.ok) throw new Error('No se pudo leer el commit base.');
            const { tree: { sha: baseTreeSha } } = await commitRes.json();

            // 3. Crear el blob con el contenido binario
            const blobRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
                {
                    method: 'POST',
                    headers: {
                        ...GH_HEADERS(token),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: bytesABase64(bytes),
                        encoding: 'base64'
                    }),
                    signal
                }
            );
            if (!blobRes.ok) throw new Error('No se pudo crear el blob.');
            const { sha: blobSha } = await blobRes.json();

            // 4. Crear un tree nuevo encima del base, con nuestro archivo
            const treeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees`,
                {
                    method: 'POST',
                    headers: {
                        ...GH_HEADERS(token),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        base_tree: baseTreeSha,
                        tree: [{
                            path,
                            mode: '100644',
                            type: 'blob',
                            sha: blobSha
                        }]
                    }),
                    signal
                }
            );
            if (!treeRes.ok) throw new Error('No se pudo crear el tree.');
            const { sha: newTreeSha } = await treeRes.json();

            // 5. Crear un commit apuntando a ese tree
            const commitNuevoRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/commits`,
                {
                    method: 'POST',
                    headers: {
                        ...GH_HEADERS(token),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Subir ${path}`,
                        tree: newTreeSha,
                        parents: [commitSha]
                    }),
                    signal
                }
            );
            if (!commitNuevoRes.ok) throw new Error('No se pudo crear el commit.');
            const { sha: newCommitSha } = await commitNuevoRes.json();

            // 6. Actualizar la rama al nuevo commit
            const patchRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${rama}`,
                {
                    method: 'PATCH',
                    headers: {
                        ...GH_HEADERS(token),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sha: newCommitSha }),
                    signal
                }
            );
            if (!patchRes.ok) {
                const err = await patchRes.json().catch(() => ({}));
                throw new Error(err.message || 'Conflicto al actualizar la rama.');
            }

            return { ok: true, sha: newCommitSha, ruta: path, tamano: bytes.length };

        } catch (e) {
            if (e.name === 'AbortError') throw e;

            // Reintento automático si es un conflicto de escritura
            if (intento < MAX_REINTENTOS && esConflicto(e.message)) {
                console.warn(`[ConfigBD.binarios] Conflicto, reintentando (${intento}/${MAX_REINTENTOS - 1})...`);
                _ramaCache = null;
                await esperar(400 * intento);
                return await subirViaGitData(path, bytes, signal, intento + 1);
            }
            throw e;
        }
    }

    // ------------------------------------------------------------
    //  API PÚBLICA
    // ------------------------------------------------------------

    /**
     * Sube un archivo binario. Elige ruta interna según tamaño.
     * @param {string} path - Ruta en el repo, ej: "app/galeria/galeria(imagen)/foto.jpg"
     * @param {File|Blob|ArrayBuffer|Uint8Array} fileOrBlob
     * @param {{ signal?: AbortSignal }} [opciones]
     */
    async function subirArchivo(path, fileOrBlob, opciones = {}) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        if (!path) throw new Error('subirArchivo requiere una ruta.');

        const bytes = await aBytes(fileOrBlob);
        if (bytes.length === 0) throw new Error('El archivo está vacío.');
        if (bytes.length > MAX_ARCHIVO) {
            const mb  = (bytes.length / 1024 / 1024).toFixed(1);
            const max = (MAX_ARCHIVO  / 1024 / 1024).toFixed(0);
            throw new Error(`Archivo demasiado grande (${mb} MB). Máximo ${max} MB.`);
        }

        if (bytes.length < UMBRAL_CONTENTS) {
            return await subirViaContents(path, bytes, opciones.signal);
        }
        return await subirViaGitData(path, bytes, opciones.signal);
    }

    /**
     * Lee un archivo binario y devuelve un Blob nativo.
     * @returns {Promise<Blob|null>} null si no existe
     */
    async function leerArchivoBinario(path, opciones = {}) {
        if (!this.estaConectado()) return null;
        if (!path) return null;

        const config = cargarConfigBD();
        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
            {
                headers: {
                    ...GH_HEADERS(config.githubToken),
                    'Accept': 'application/vnd.github.raw'
                },
                signal: opciones.signal
            }
        );

        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`No se pudo leer ${path}.`);
        return await res.blob();
    }

    /**
     * Lee un archivo binario y devuelve un blob: URL listo para
     * poner en <img src>, <audio src>, <video src>, etc.
     * IMPORTANTE: llamar URL.revokeObjectURL() cuando ya no se use.
     * @returns {Promise<string|null>}
     */
    async function leerArchivoBinarioComoURL(path, opciones = {}) {
        const blob = await this.leerArchivoBinario(path, opciones);
        if (!blob) return null;
        return URL.createObjectURL(blob);
    }

    /**
     * Comprueba si un archivo existe (sin descargarlo entero).
     */
    async function existeArchivo(path, opciones = {}) {
        if (!this.estaConectado()) return false;
        if (!path) return false;

        const config = cargarConfigBD();
        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
            {
                headers: GH_HEADERS(config.githubToken),
                signal: opciones.signal
            }
        );

        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`Error comprobando ${path}.`);
        return true;
    }

    /**
     * Elimina un archivo del repo (y su entrada en git).
     */
    async function eliminarArchivo(path, opciones = {}) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        if (!path) throw new Error('eliminarArchivo requiere una ruta.');

        const config = cargarConfigBD();

        // Necesitamos el sha para poder borrar
        const infoRes = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
            {
                headers: GH_HEADERS(config.githubToken),
                signal: opciones.signal
            }
        );

        if (infoRes.status === 404) return { ok: true, yaNoExistia: true };
        if (!infoRes.ok) throw new Error(`No se pudo leer ${path}.`);
        const info = await infoRes.json();

        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`,
            {
                method: 'DELETE',
                headers: {
                    ...GH_HEADERS(config.githubToken),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Eliminar ${path}`,
                    sha: info.sha
                }),
                signal: opciones.signal
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `No se pudo eliminar ${path}.`);
        }
        return { ok: true };
    }

    // ------------------------------------------------------------
    //  Adjuntar a ConfigBD
    // ------------------------------------------------------------
    ConfigBD.subirArchivo              = subirArchivo;
    ConfigBD.leerArchivoBinario        = leerArchivoBinario;
    ConfigBD.leerArchivoBinarioComoURL = leerArchivoBinarioComoURL;
    ConfigBD.existeArchivo             = existeArchivo;
    ConfigBD.eliminarArchivo           = eliminarArchivo;
    ConfigBD.MAX_ARCHIVO_BINARIO       = MAX_ARCHIVO;

    // Envolver desconectar() para resetear el caché de rama
    const _desconectarOriginal = ConfigBD.desconectar.bind(ConfigBD);
    ConfigBD.desconectar = async function () {
        _ramaCache = null;
        return await _desconectarOriginal();
    };
})();
