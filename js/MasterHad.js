// ============================================================
//  MasterHad.js — Caja de herramientas global de VicWebOS
//  ------------------------------------------------------------
//  Todas las apps y widgets pueden usar estas funciones desde
//  su iframe con:
//
//      const mh = window.parent.MasterHad;
//
//  Módulos:
//    - JSON: leer / escribir / borrar / vaciar / existe / actualizar
//    - Rutas: helpers para construir paths según REGLAS_APPS.txt
//    - Binarios: publicar / reemplazar / borrar / leer (URL o Blob)
//      para imagen, audio, video y documento
//    - Galería: listar / subir / borrar / leer / abrirPicker
//    - Utilidades: comprimir imagen, formatear bytes, generar nombre
//
//  Depende de:
//    - ConfigBD.js           (lectura/escritura de JSON)
//    - ConfigBD.binarios.js  (subida/descarga de binarios)
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

    function generarId(prefijo) {
        const p = prefijo || 'x';
        return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
    //  Comprimir imagen
    // ------------------------------------------------------------
    async function comprimirImagen(file, maxLado = 1920, calidad = 0.8) {
        try {
            if (!file.type || !file.type.startsWith('image/')) return file;
            if (file.type === 'image/svg+xml') return file;
            if (file.type === 'image/gif')     return file;

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
    //  Rutas (binarios de apps — audio, video, documento)
    //  Las IMÁGENES ya no van acá, van al módulo galeria.
    // ------------------------------------------------------------
    const rutas = {
        jsonGlobal:  (appId)         => `app/${appId}/${appId}.json`,
        jsonUsuario: (appId, codigo) => `app/${appId}/${(codigo || requerirCodigo())}${appId}.json`,
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

    async function borrarJSON(path) {
        return await bd().eliminarArchivo(path);
    }

    async function vaciarJSON(path, estructura = {}) {
        return await bd().escribirArchivo(path, estructura);
    }

    async function existeJSON(path) {
        return await bd().existeArchivo(path);
    }

    async function actualizarJSON(path, transformador) {
        if (typeof transformador !== 'function') {
            throw new Error('actualizarJSON requiere una función transformadora.');
        }
        return await bd().actualizarArchivo(path, transformador);
    }

    // ------------------------------------------------------------
    //  Binarios (audio, video, documento)
    // ------------------------------------------------------------
    async function publicarBinario(appId, tipo, fileOrBlob, opciones = {}) {
        if (!appId)       throw new Error('publicar requiere un appId.');
        if (!fileOrBlob)  throw new Error('publicar requiere un archivo.');

        const ext  = opciones.extension || extensionDe(fileOrBlob.name || '') || 'bin';
        const nombre = opciones.nombre || generarNombre(ext);

        const construir = rutas[tipo];
        if (!construir) throw new Error(`Tipo binario desconocido: ${tipo}`);
        const ruta = construir(appId, nombre);

        let contenido = fileOrBlob;
        await bd().subirArchivo(ruta, contenido, opciones);
        return { ruta, nombre, tamano: contenido.size || contenido.byteLength || 0 };
    }

    async function reemplazarBinario(ruta, fileOrBlob, opciones = {}) {
        if (!ruta)       throw new Error('reemplazar requiere una ruta.');
        if (!fileOrBlob) throw new Error('reemplazar requiere un archivo.');
        await bd().subirArchivo(ruta, fileOrBlob, opciones);
        return { ruta, tamano: fileOrBlob.size || fileOrBlob.byteLength || 0 };
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

    // ============================================================
    //  MÓDULO GALERÍA
    //  ------------------------------------------------------------
    //  Estructura física:
    //      Galeria{CODIGO}/img_xxx.jpg
    //      Galeria{CODIGO}/galeria.json    ← índice del usuario
    //      app/galeria/galeria.json        ← índice global
    // ============================================================
    const galeria = (function () {

        const CARPETA_BASE = 'Galeria';
        const JSON_GLOBAL  = 'app/galeria/galeria.json';

        function nombreCarpeta(codigo) {
            const c = codigo || requerirCodigo();
            return `${CARPETA_BASE}${c}`;
        }

        function rutaJSONUsuario(codigo) {
            return `${nombreCarpeta(codigo)}/galeria.json`;
        }

        function rutaArchivoImagen(codigo, archivo) {
            return `${nombreCarpeta(codigo)}/${archivo}`;
        }

        function rutaJSONGlobal() {
            return JSON_GLOBAL;
        }

        async function leerJSONUsuario(codigo, fresh = false) {
            const ruta = rutaJSONUsuario(codigo);
            try {
                const data = fresh
                    ? await bd().leerArchivoFresh(ruta)
                    : await bd().leerArchivo(ruta);
                return normalizarUsuario(data, codigo);
            } catch (e) {
                return normalizarUsuario(null, codigo);
            }
        }

        async function leerJSONGlobal(fresh = false) {
            try {
                const data = fresh
                    ? await bd().leerArchivoFresh(JSON_GLOBAL)
                    : await bd().leerArchivo(JSON_GLOBAL);
                return normalizarGlobal(data);
            } catch (e) {
                return normalizarGlobal(null);
            }
        }

        function normalizarUsuario(data, codigo) {
            if (!data || typeof data !== 'object') {
                return { version: 1, codigo, carpetas: [], imagenes: [] };
            }
            if (!Array.isArray(data.carpetas)) data.carpetas = [];
            if (!Array.isArray(data.imagenes)) data.imagenes = [];
            data.version = 1;
            data.codigo = codigo;
            return data;
        }

        function normalizarGlobal(data) {
            if (!data || typeof data !== 'object') {
                return { version: 1, actualizado: null, usuarios: {} };
            }
            if (!data.usuarios || typeof data.usuarios !== 'object') data.usuarios = {};
            data.version = 1;
            return data;
        }

        // -------- Listar imágenes --------
        // codigo null → mis imágenes
        async function listarImagenes(codigo, opciones = {}) {
            const cod = codigo || requerirCodigo();
            const fresh = opciones.fresh === true;
            const data = await leerJSONUsuario(cod, fresh);
            let imgs = data.imagenes.slice();
            if (opciones.carpetaId) {
                imgs = imgs.filter(i => i.carpeta === opciones.carpetaId);
            }
            imgs.sort((a, b) => new Date(b.subida) - new Date(a.subida));
            return imgs;
        }

        // -------- Listar carpetas --------
        async function listarCarpetas(codigo, opciones = {}) {
            const cod = codigo || requerirCodigo();
            const data = await leerJSONUsuario(cod, opciones.fresh === true);
            return data.carpetas.slice();
        }

        // -------- Obtener imagen por id --------
        async function obtenerImagen(id, codigo) {
            const cod = codigo || requerirCodigo();
            const data = await leerJSONUsuario(cod, true);
            return data.imagenes.find(i => i.id === id) || null;
        }

        // -------- Leer URL lista para <img> --------
        async function leerImagenURL(id, codigo) {
            const cod = codigo || requerirCodigo();
            const meta = await obtenerImagen(id, cod);
            if (!meta) return null;
            const ruta = rutaArchivoImagen(cod, meta.archivo);
            return await bd().leerArchivoBinarioComoURL(ruta);
        }

        async function leerImagenBlob(id, codigo) {
            const cod = codigo || requerirCodigo();
            const meta = await obtenerImagen(id, cod);
            if (!meta) return null;
            const ruta = rutaArchivoImagen(cod, meta.archivo);
            return await bd().leerArchivoBinario(ruta);
        }

        // -------- Subir imagen --------
        // file: File nativo. Devuelve metadata.
        async function subirImagen(file, opciones = {}) {
            if (!file) throw new Error('subirImagen requiere un archivo.');
            const cod = opciones.codigo || requerirCodigo();

            // Comprimir (por defecto sí)
            let contenido = file;
            if (opciones.comprimir !== false) {
                contenido = await comprimirImagen(
                    file,
                    opciones.maxLado || 1920,
                    opciones.calidad  || 0.8
                );
            }

            const id = opciones.id || generarId('img');
            const ext = extensionDe(file.name || '') || 'jpg';
            const archivo = `${id}.${ext}`;
            const ruta = rutaArchivoImagen(cod, archivo);

            // 1. Subir archivo físico
            await bd().subirArchivo(ruta, contenido, opciones);

            // 2. Metadata
            const meta = {
                id,
                nombre: file.name || archivo,
                archivo,
                carpeta: opciones.carpeta || 'c_general',
                tipo: contenido.type || tipoMimeDe(archivo),
                tamano: contenido.size || contenido.byteLength || 0,
                subida: new Date().toISOString()
            };

            // 3. Actualizar JSON del usuario (fuente de verdad)
            await bd().actualizarArchivo(rutaJSONUsuario(cod), (actual) => {
                actual = normalizarUsuario(actual, cod);
                if (!actual.carpetas.find(c => c.id === 'c_general')) {
                    actual.carpetas.push({ id: 'c_general', nombre: 'General', creada: new Date().toISOString() });
                }
                actual.imagenes.unshift(meta);
                actual.actualizado = new Date().toISOString();
                return actual;
            });

            // 4. Actualizar JSON global (índice)
            await bd().actualizarArchivo(JSON_GLOBAL, (actual) => {
                actual = normalizarGlobal(actual);
                if (!actual.usuarios[cod]) {
                    actual.usuarios[cod] = { carpetas: [], imagenes: [] };
                }
                const u = actual.usuarios[cod];
                if (!Array.isArray(u.imagenes)) u.imagenes = [];
                if (!Array.isArray(u.carpetas)) u.carpetas = [];
                if (!u.carpetas.find(c => c.id === 'c_general')) {
                    u.carpetas.push({ id: 'c_general', nombre: 'General', creada: new Date().toISOString() });
                }
                u.imagenes.unshift(meta);
                u.actualizado = new Date().toISOString();
                actual.actualizado = new Date().toISOString();
                return actual;
            });

            return meta;
        }

        // -------- Borrar imagen --------
        async function borrarImagen(id, codigo) {
            const cod = codigo || requerirCodigo();

            // 1. Obtener metadata
            const meta = await obtenerImagen(id, cod);
            if (!meta) return { ok: true, yaNoExistia: true };

            // 2. Borrar archivo físico (si falla, seguimos igual para limpiar JSON)
            try {
                await bd().eliminarArchivo(rutaArchivoImagen(cod, meta.archivo));
            } catch (e) {
                console.warn('[galeria] No se pudo borrar archivo físico:', e);
            }

            // 3. Quitar del JSON del usuario
            await bd().actualizarArchivo(rutaJSONUsuario(cod), (actual) => {
                actual = normalizarUsuario(actual, cod);
                actual.imagenes = actual.imagenes.filter(i => i.id !== id);
                actual.actualizado = new Date().toISOString();
                return actual;
            });

            // 4. Quitar del JSON global
            await bd().actualizarArchivo(JSON_GLOBAL, (actual) => {
                actual = normalizarGlobal(actual);
                const u = actual.usuarios[cod];
                if (u && Array.isArray(u.imagenes)) {
                    u.imagenes = u.imagenes.filter(i => i.id !== id);
                    u.actualizado = new Date().toISOString();
                }
                actual.actualizado = new Date().toISOString();
                return actual;
            });

            return { ok: true };
        }

        // -------- Renombrar imagen (solo nombre visible) --------
        async function renombrarImagen(id, nuevoNombre, codigo) {
            const cod = codigo || requerirCodigo();
            await bd().actualizarArchivo(rutaJSONUsuario(cod), (actual) => {
                actual = normalizarUsuario(actual, cod);
                const img = actual.imagenes.find(i => i.id === id);
                if (img) img.nombre = nuevoNombre;
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            await bd().actualizarArchivo(JSON_GLOBAL, (actual) => {
                actual = normalizarGlobal(actual);
                const u = actual.usuarios[cod];
                if (u && Array.isArray(u.imagenes)) {
                    const img = u.imagenes.find(i => i.id === id);
                    if (img) img.nombre = nuevoNombre;
                }
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            return { ok: true };
        }

        // -------- Mover a carpeta --------
        async function moverACarpeta(id, carpetaId, codigo) {
            const cod = codigo || requerirCodigo();
            await bd().actualizarArchivo(rutaJSONUsuario(cod), (actual) => {
                actual = normalizarUsuario(actual, cod);
                const img = actual.imagenes.find(i => i.id === id);
                if (img) img.carpeta = carpetaId;
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            await bd().actualizarArchivo(JSON_GLOBAL, (actual) => {
                actual = normalizarGlobal(actual);
                const u = actual.usuarios[cod];
                if (u && Array.isArray(u.imagenes)) {
                    const img = u.imagenes.find(i => i.id === id);
                    if (img) img.carpeta = carpetaId;
                }
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            return { ok: true };
        }

        // -------- Crear carpeta --------
        async function crearCarpeta(nombre, codigo) {
            const cod = codigo || requerirCodigo();
            const nombreLimpio = String(nombre || '').trim().slice(0, 40);
            if (!nombreLimpio) throw new Error('El nombre no puede estar vacío.');
            const carpeta = {
                id: generarId('c'),
                nombre: nombreLimpio,
                creada: new Date().toISOString()
            };
            await bd().actualizarArchivo(rutaJSONUsuario(cod), (actual) => {
                actual = normalizarUsuario(actual, cod);
                actual.carpetas.push(carpeta);
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            await bd().actualizarArchivo(JSON_GLOBAL, (actual) => {
                actual = normalizarGlobal(actual);
                if (!actual.usuarios[cod]) actual.usuarios[cod] = { carpetas: [], imagenes: [] };
                if (!Array.isArray(actual.usuarios[cod].carpetas)) actual.usuarios[cod].carpetas = [];
                actual.usuarios[cod].carpetas.push(carpeta);
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            return carpeta;
        }

        // --------------------------------------------------------
        //  PICKER — overlay con iframe que deja elegir imágenes
        //  Devuelve: id (string) | array de ids | null si cancela
        // --------------------------------------------------------
        let _pickerActivo = null;

        function abrirPicker(opciones = {}) {
            if (_pickerActivo) {
                // Ya hay un picker abierto → devolvemos la promesa actual
                return _pickerActivo.promesa;
            }

            const opts = {
                multiple: opciones.multiple === true,
                titulo: opciones.titulo || 'Elige una imagen',
                carpetaId: opciones.carpetaId || null
            };

            return new Promise((resolve) => {
                // Overlay
                const overlay = document.createElement('div');
                overlay.className = 'mh-galeria-picker-overlay';
                overlay.style.cssText = `
                    position: fixed; inset: 0; z-index: 10000;
                    background: rgba(0,0,0,0.55);
                    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
                    display: flex; align-items: center; justify-content: center;
                    padding: 20px; animation: mhGaleriaFade 0.15s ease;
                `;

                // iframe
                const iframe = document.createElement('iframe');
                iframe.style.cssText = `
                    width: 100%; max-width: 640px; height: 90%;
                    max-height: 620px; border: none;
                    border-radius: 20px; background: #FFFFFF;
                    box-shadow: 0 24px 48px rgba(0,0,0,0.35);
                `;
                iframe.src = 'herramientas/galeria/picker.html';
                iframe.setAttribute('data-titulo', opts.titulo);
                iframe.setAttribute('data-multiple', opts.multiple ? '1' : '0');
                if (opts.carpetaId) iframe.setAttribute('data-carpeta', opts.carpetaId);

                overlay.appendChild(iframe);
                document.body.appendChild(overlay);

                // Animación de entrada
                if (!document.getElementById('mh-galeria-picker-anim')) {
                    const style = document.createElement('style');
                    style.id = 'mh-galeria-picker-anim';
                    style.textContent = `
                        @keyframes mhGaleriaFade { from { opacity: 0; } to { opacity: 1; } }
                    `;
                    document.head.appendChild(style);
                }

                function cerrar(resultado) {
                    window.removeEventListener('message', onMessage);
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    _pickerActivo = null;
                    resolve(resultado);
                }

                function onMessage(ev) {
                    const d = ev.data;
                    if (!d || typeof d !== 'object') return;
                    if (d.type === 'galeria:pick') {
                        const ids = Array.isArray(d.ids) ? d.ids : [d.id];
                        cerrar(opts.multiple ? ids : (ids[0] || null));
                    }
                    if (d.type === 'galeria:cancel') {
                        cerrar(null);
                    }
                }

                window.addEventListener('message', onMessage);

                _pickerActivo = { overlay, promesa: null };
                _pickerActivo.promesa = new Promise(() => {}); // no usado, solo marca
            });
        }

        return {
            nombreCarpeta,
            rutaJSONUsuario,
            rutaArchivoImagen,
            rutaJSONGlobal,
            listarImagenes,
            listarCarpetas,
            obtenerImagen,
            leerImagenURL,
            leerImagenBlob,
            subirImagen,
            borrarImagen,
            renombrarImagen,
            moverACarpeta,
            crearCarpeta,
            abrirPicker
        };
    })();

    // ------------------------------------------------------------
    //  Objeto público
    // ------------------------------------------------------------
    const MasterHad = {
        leerJSON,
        escribirJSON,
        borrarJSON,
        vaciarJSON,
        existeJSON,
        actualizarJSON,
        rutas,
        comprimirImagen,
        formatearBytes,
        extensionDe,
        generarNombre,
        generarId,
        tipoMimeDe,
        galeria,
        version: '1.1.0'
    };

    // Fachadas de binarios (audio, video, documento)
    const TIPOS = [
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

    window.MasterHad = MasterHad;
})();
