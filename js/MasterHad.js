// ============================================================
//  MasterHad.js — Caja de herramientas global de VicWebOS
//  ------------------------------------------------------------
//  Todas las apps y widgets pueden usar estas funciones desde
//  su iframe con:
//
//      const mh = window.parent.MasterHad;
//
//  Qué ofrece:
//    - JSON: leer / escribir / borrar / vaciar / existe / actualizar
//    - Rutas: helpers para construir paths según REGLAS_APPS.txt
//    - Binarios: publicar / reemplazar / borrar / leer (URL o Blob)
//      para imagen, audio, video y documento
//    - Utilidades: comprimir imagen, formatear bytes, generar nombre
//
//  Depende de:
//    - ConfigBD.js           (lectura/escritura de JSON)
//    - ConfigBD.binarios.js  (subida/descarga de binarios)
//
//  NO depende de JsIndex.js. Puede cargarse antes o después.
// ============================================================

(function () {
    'use strict';

    // ------------------------------------------------------------
    //  Helpers internos
    // ------------------------------------------------------------
    function bd() {
        const b = window.ConfigBD;
        if (!b) throw new Error('ConfigBD no está disponible.');
        return b;
    }

    function codigoActual() {
        if (window.__vicwebos && typeof window.__vicwebos.obtenerCuenta === 'function') {
            const c = window.__vicwebos.obtenerCuenta();
            return c && c.codigo ? c.codigo : null;
        }
        return window.cuentaActual ? window.cuentaActual.codigo : null;
    }

    function requerirCodigo() {
        const c = codigoActual();
        if (!c) throw new Error('Esta operación necesita una cuenta activa.');
        return c;
    }

    function extensionDe(nombre) {
        const m = String(nombre).match(/\.([a-z0-9]+)$/i);
        return m ? m[1].toLowerCase() : '';
    }

    function generarNombre(extension) {
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 7);
        const ext = extension
            ? (extension.startsWith('.') ? extension : '.' + extension)
            : '';
        return `${ts}_${rand}${ext}`;
    }

    function tipoMimeDe(nombre) {
        const ext = extensionDe(nombre);
        const mapa = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
            bmp: 'image/bmp', avif: 'image/avif',
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
            webm: 'audio/webm',
            mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
            mkv: 'video/x-matroska',
            pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
            json: 'application/json',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            csv: 'text/csv'
        };
        return mapa[ext] || 'application/octet-stream';
    }

    function formatearBytes(n) {
        if (!n || n < 0) return '0 B';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let v = n;
        while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
        return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
    }

    // ------------------------------------------------------------
    //  Comprimir imagen antes de subir
    //  Ahorra mucho espacio en GitHub. Preserva SVG y GIF.
    // ------------------------------------------------------------
    async function comprimirImagen(file, maxLado = 1920, calidad = 0.8) {
        try {
            if (!file.type || !file.type.startsWith('image/')) return file;
            if (file.type === 'image/svg+xml') return file; // vectorial
            if (file.type === 'image/gif')     return file; // animación

            const bitmap = await createImageBitmap(file);
            const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
            const w = Math.round(bitmap.width  * escala);
            const h = Math.round(bitmap.height * escala);

            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);

            return await new Promise(res => canvas.toBlob(res, 'image/jpeg', calidad));
        } catch (e) {
            console.warn('[MasterHad] No se pudo comprimir, se sube original:', e);
            return file;
        }
    }

    // ------------------------------------------------------------
    //  Rutas — construidas según REGLAS_APPS.txt
    // ------------------------------------------------------------
    const rutas = {
        jsonGlobal:  (appId)         => `app/${appId}/${appId}.json`,
        jsonUsuario: (appId, codigo) => `app/${appId}/${(codigo || requerirCodigo())}${appId}.json`,
        imagen:      (appId, nombre) => `app/${appId}/${appId}(imagen)/${nombre}`,
        audio:       (appId, nombre) => `app/${appId}/${appId}(audio)/${nombre}`,
        video:       (appId, nombre) => `app/${appId}/${appId}(video)/${nombre}`,
        documento:   (appId, nombre) => `app/${appId}/${appId}(documento)/${nombre}`
    };

    // ------------------------------------------------------------
    //  JSON
    // ------------------------------------------------------------
    async function leerJSON(path) {
        return await bd().leerArchivo(path);
    }

    async function escribirJSON(path, datos) {
        return await bd().escribirArchivo(path, datos);
    }

    // Borra el archivo del repo. Para "vaciar sin borrar" usa vaciarJSON.
    async function borrarJSON(path) {
        return await bd().eliminarArchivo(path);
    }

    async function vaciarJSON(path, estructura = {}) {
        return await bd().escribirArchivo(path, estructura);
    }

    async function existeJSON(path) {
        return await bd().existeArchivo(path);
    }

    // Lee, aplica una transformación y escribe de vuelta.
    // Nota: no protege contra escrituras concurrentes verdaderas,
    // pero reduce la ventana. Para uso intensivo, escribe aparte.
    async function actualizarJSON(path, transformador) {
        if (typeof transformador !== 'function') {
            throw new Error('actualizarJSON requiere una función transformadora.');
        }
        const actual = (await leerJSON(path)) ?? {};
        const nuevo  = await transformador(actual);
        const final  = (nuevo === undefined) ? actual : nuevo;
        await escribirJSON(path, final);
        return final;
    }

    // ------------------------------------------------------------
    //  Binarios — implementación genérica
    // ------------------------------------------------------------
    async function publicarBinario(appId, tipo, fileOrBlob, opciones = {}) {
        if (!appId)       throw new Error('publicar requiere un appId.');
        if (!fileOrBlob)  throw new Error('publicar requiere un archivo.');

        const ext  = opciones.extension || extensionDe(fileOrBlob.name || '') || 'bin';
        const nombre = opciones.nombre || generarNombre(ext);

        const construir = rutas[tipo];
        if (!construir) throw new Error(`Tipo binario desconocido: ${tipo}`);
        const ruta = construir(appId, nombre);

        // Comprimir imagen salvo que se desactive explícitamente
        let contenido = fileOrBlob;
        if (tipo === 'imagen' && opciones.comprimir !== false) {
            contenido = await comprimirImagen(
                fileOrBlob,
                opciones.maxLado || 1920,
                opciones.calidad  || 0.8
            );
        }

        await bd().subirArchivo(ruta, contenido, opciones);

        return {
            ruta,
            nombre,
            tamano: contenido.size || contenido.byteLength || 0
        };
    }

    async function reemplazarBinario(ruta, fileOrBlob, opciones = {}) {
        if (!ruta)       throw new Error('reemplazar requiere una ruta.');
        if (!fileOrBlob) throw new Error('reemplazar requiere un archivo.');

        let contenido = fileOrBlob;
        if (opciones.comprimir !== false && ruta.includes('(imagen)')) {
            contenido = await comprimirImagen(
                fileOrBlob,
                opciones.maxLado || 1920,
                opciones.calidad  || 0.8
            );
        }

        await bd().subirArchivo(ruta, contenido, opciones);
        return { ruta, tamano: contenido.size || contenido.byteLength || 0 };
    }

    async function borrarBinario(ruta) {
        if (!ruta) throw new Error('borrar requiere una ruta.');
        return await bd().eliminarArchivo(ruta);
    }

    async function leerBinarioBlob(ruta, opciones = {}) {
        if (!ruta) return null;
        return await bd().leerArchivoBinario(ruta, opciones);
    }

    async function leerBinarioURL(ruta, opciones = {}) {
        if (!ruta) return null;
        return await bd().leerArchivoBinarioComoURL(ruta, opciones);
    }

    // ------------------------------------------------------------
    //  Fachadas por tipo (imagen, audio, video, documento)
    //  Se generan solas para evitar duplicar código.
    // ------------------------------------------------------------
    const MasterHad = {
        // --- JSON ---
        leerJSON,
        escribirJSON,
        borrarJSON,
        vaciarJSON,
        existeJSON,
        actualizarJSON,

        // --- Rutas ---
        rutas,

        // --- Utilidades ---
        comprimirImagen,
        formatearBytes,
        extensionDe,
        generarNombre,
        tipoMimeDe,

        // --- Info ---
        version: '1.0.0'
    };

    // Generar: publicarImagen, reemplazarAudio, borrarDocumento, etc.
    const TIPOS = [
        { cap: 'Imagen',    clave: 'imagen'    },
        { cap: 'Audio',     clave: 'audio'     },
        { cap: 'Video',     clave: 'video'     },
        { cap: 'Documento', clave: 'documento' }
    ];

    TIPOS.forEach(({ cap, clave }) => {
        MasterHad[`publicar${cap}`]    = (appId, fileOrBlob, opts) => publicarBinario(appId, clave, fileOrBlob, opts);
        MasterHad[`reemplazar${cap}`]  = (ruta, fileOrBlob, opts) => reemplazarBinario(ruta, fileOrBlob, opts);
        MasterHad[`borrar${cap}`]      = (ruta)                   => borrarBinario(ruta);
        MasterHad[`leer${cap}URL`]     = (ruta, opts)             => leerBinarioURL(ruta, opts);
        MasterHad[`leer${cap}Blob`]    = (ruta, opts)             => leerBinarioBlob(ruta, opts);
    });

    // ------------------------------------------------------------
    //  Exponer globalmente
    // ------------------------------------------------------------
    window.MasterHad = MasterHad;
})();
