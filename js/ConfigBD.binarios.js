// ============================================================
//  ConfigBD.binarios.js
//  ------------------------------------------------------------
//  Extiende ConfigBD con subida y lectura de archivos binarios
//  (imágenes, audio, video, documentos) contra el repo de datos
//  en GitHub.
//
//  Se carga DESPUÉS de ConfigBD.js.
//
//  IMPORTANTE: el caché de la rama por defecto es POR COMUNIDAD,
//  así al cambiar de comunidad no arrastramos ramas de otra.
// ============================================================

(function () {
    'use strict';

    const UMBRAL_CONTENTS = 900 * 1024;        // 900 KB
    const MAX_ARCHIVO     = 50 * 1024 * 1024;  // 50 MB
    const MAX_REINTENTOS  = 3;

    // Caché de rama por comunidad: { comId: 'main' | 'master' }
    const _ramasPorComunidad = new Map();

    // ------------------------------------------------------------
    //  Utilidades internas
    // ------------------------------------------------------------
    function bytesABase64(bytes) {
        const CHUNK = 0x8000;
        let binario = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binario += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binario);
    }

    // ------------------------------------------------------------
    //  aBytes: convierte cualquier cosa en Uint8Array.
    //
    //  IMPORTANTE: usamos DUCK TYPING en vez de instanceof.
    //
    //  Motivo: cuando un iframe (app) crea un Blob y lo pasa al
    //  padre (shell), el Blob es de OTRO realm/constructor. En JS,
    //  `iframeBlob instanceof parentBlob` da false. Por eso miramos
    //  las propiedades (arrayBuffer, size, byteLength, etc.) en vez
    //  de la clase.
    // ------------------------------------------------------------
    async function aBytes(fileOrBlob) {
        if (!fileOrBlob) {
            throw new Error('Se esperaba un File, Blob, ArrayBuffer o Uint8Array.');
        }

        // File / Blob (cross-realm): tienen .arrayBuffer() que devuelve Promise y .size numérico
        if (typeof fileOrBlob.arrayBuffer === 'function' && typeof fileOrBlob.size === 'number') {
            return new Uint8Array(await fileOrBlob.arrayBuffer());
        }

        // ArrayBuffer nativo (cross-realm safe)
        if (Object.prototype.toString.call(fileOrBlob) === '[object ArrayBuffer]') {
            return new Uint8Array(fileOrBlob);
        }

        // TypedArray / DataView (Uint8Array, Int16Array, etc.)
        if (ArrayBuffer.isView(fileOrBlob)) {
            return new Uint8Array(
                fileOrBlob.buffer,
                fileOrBlob.byteOffset,
                fileOrBlob.byteLength
            );
        }

        throw new Error('Se esperaba un File, Blob, ArrayBuffer o Uint8Array.');
    }

    function idComunidadActiva() {
        if (typeof window.obtenerComunidadActiva === 'function') {
            const c = window.obtenerComunidadActiva();
            return c ? c.id : 'none';
        }
        return 'none';
    }

    async function obtenerRamaDefault() {
        const comId = idComunidadActiva();
        if (_ramasPorComunidad.has(comId)) return _ramasPorComunidad.get(comId);

        const config = cargarConfigBD();
        const res = await fetch(
            `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
            { headers: GH_HEADERS(config.githubToken) }
        );
        if (!res.ok) throw new Error('No se pudo leer la info del repositorio.');
        const data = await res.json();
        const rama = data.default_branch || 'main';
        _ramasPorComunidad.set(comId, rama);
        return rama;
    }

    function olvidarRamaActual() {
        _ramasPorComunidad.delete(idComunidadActiva());
    }

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
    //  RUTA B — Git Data API (≤ 50 MB, con reintentos)
    // ------------------------------------------------------------
    async function subirViaGitData(path, bytes, signal, intento = 1) {
        const config = cargarConfigBD();
        const token = config.githubToken;
        const owner = config.githubOwner;
        const repo  = config.githubRepo;
        const rama  = await obtenerRamaDefault();

        try {
            const refRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${rama}`,
                { headers: GH_HEADERS(token), signal }
            );
            if (!refRes.ok) throw new Error(`No se pudo leer la rama ${rama}.`);
            const { object: { sha: commitSha } } = await refRes.json();

            const commitRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
                { headers: GH_HEADERS(token), signal }
            );
            if (!commitRes.ok) throw new Error('No se pudo leer el commit base.');
            const { tree: { sha: baseTreeSha } } = await commitRes.json();

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

            if (intento < MAX_REINTENTOS && esConflicto(e.message)) {
                console.warn(`[ConfigBD.binarios] Conflicto, reintentando (${intento}/${MAX_REINTENTOS - 1})...`);
                olvidarRamaActual();
                await esperar(400 * intento);
                return await subirViaGitData(path, bytes, signal, intento + 1);
            }
            throw e;
        }
    }

    // ------------------------------------------------------------
    //  API PÚBLICA
    // ------------------------------------------------------------
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

    async function leerArchivoBinarioComoURL(path, opciones = {}) {
        const blob = await this.leerArchivoBinario(path, opciones);
        if (!blob) return null;
        return URL.createObjectURL(blob);
    }

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

    async function eliminarArchivo(path, opciones = {}) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        if (!path) throw new Error('eliminarArchivo requiere una ruta.');

        const config = cargarConfigBD();

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

    // Invalidar la rama cacheada al desconectar o cambiar de comunidad
    const _desconectarOriginal = ConfigBD.desconectar.bind(ConfigBD);
    ConfigBD.desconectar = async function () {
        _ramasPorComunidad.clear();
        return await _desconectarOriginal();
    };

    // Exponer una función de limpieza para cuando se cambia de comunidad
    ConfigBD.__olvidarRamasBinarios = function () {
        _ramasPorComunidad.clear();
    };
})();
