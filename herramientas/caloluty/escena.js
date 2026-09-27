// ============================================================
//  Caloluty — Escena Three.js con temas y ciudad viva
//  ------------------------------------------------------------
//  · Targets a nivel de calle, caminando por la ciudad
//  · Colores del escenario heredados del tema del shell
//  · Estrellas, neón parpadeante, coches de fondo, luciérnagas
// ============================================================

(function () {
    'use strict';

    const Z_MIN = -22;
    const Z_MAX = -8;
    const X_MAX = 4.5;
    const Y_SUELO = 1.0;
    const Y_MAX_DESVIO = 1.2;

    let escena = null;
    let camara = null;
    let renderer = null;
    let contenedorActual = null;

    let targets = [];
    let proximoId = 1;
    let tiempo = 0;

    let grupoCiudad = null;
    let grupoEstrellas = null;
    let grupoCoches = null;
    let grupoLuciernagas = null;
    let cochesDeFondo = [];
    let luciernagas = [];
    let ventanasNeon = [];
    let edificiosEmissive = [];

    const T = {
        acento: 0x8B5CF6,
        acentoOscuro: 0x6D28D9,
        acentoClaro: 0xA78BFA,
        fondo: 0x18181B,
        fondoSec: 0x27272A,
        edificio: 0x3F3F46,
        edificioOscuro: 0x1F1F23,
        estrella: 0xFFFFFF,
        neon1: 0xEF4444,
        neon2: 0x10B981,
        neon3: 0xF59E0B
    };

    function cssVar(nombre, fallback) {
        try {
            const rootPadre = window.parent.document.documentElement;
            const v = getComputedStyle(rootPadre).getPropertyValue(nombre).trim();
            return v || fallback;
        } catch (e) { return fallback; }
    }

    function hexAInt(hex) {
        const h = hex.replace('#', '').trim();
        if (h.length === 3) {
            return parseInt(h[0]+h[0]+h[1]+h[1]+h[2]+h[2], 16);
        }
        return parseInt(h, 16);
    }

    function leerTema() {
        T.acento         = hexAInt(cssVar('--violet-500', '#8B5CF6'));
        T.acentoOscuro   = hexAInt(cssVar('--violet-700', '#6D28D9'));
        T.acentoClaro    = hexAInt(cssVar('--violet-400', '#A78BFA'));
        T.fondo          = hexAInt(cssVar('--gray-900', '#18181B'));
        T.fondoSec       = hexAInt(cssVar('--gray-800', '#27272A'));
        T.edificio       = hexAInt(cssVar('--gray-700', '#3F3F46'));
        T.edificioOscuro = hexAInt(cssVar('--gray-900', '#1F1F23'));
        T.neon1 = 0xEF4444;
        T.neon2 = 0x10B981;
        T.neon3 = 0xF59E0B;
    }

    // ---------- Texturas de targets ----------
    function crearTexturaTarget(color, tipo) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');

        const grad = c.createRadialGradient(64, 64, 10, 64, 64, 62);
        grad.addColorStop(0, color.claro);
        grad.addColorStop(1, color.oscuro);
        c.fillStyle = grad;
        c.beginPath();
        c.arc(64, 64, 60, 0, Math.PI * 2);
        c.fill();

        c.strokeStyle = color.borde;
        c.lineWidth = 5;
        c.beginPath();
        c.arc(64, 64, 57, 0, Math.PI * 2);
        c.stroke();

        c.strokeStyle = '#FFFFFF';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.lineJoin = 'round';

        if (tipo === 'rojo') {
            c.beginPath(); c.arc(64, 64, 34, 0, Math.PI * 2); c.stroke();
            c.beginPath(); c.arc(64, 64, 14, 0, Math.PI * 2); c.stroke();
            c.beginPath();
            c.moveTo(64, 20); c.lineTo(64, 42);
            c.moveTo(64, 86); c.lineTo(64, 108);
            c.moveTo(20, 64); c.lineTo(42, 64);
            c.moveTo(86, 64); c.lineTo(108, 64);
            c.stroke();
        } else {
            c.beginPath();
            c.moveTo(64, 24);
            c.lineTo(96, 40);
            c.lineTo(96, 70);
            c.quadraticCurveTo(96, 96, 64, 108);
            c.quadraticCurveTo(32, 96, 32, 70);
            c.lineTo(32, 40);
            c.closePath();
            c.stroke();
            c.beginPath();
            c.moveTo(50, 66); c.lineTo(62, 78); c.lineTo(82, 54);
            c.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }

    const COLOR_ROJO = { claro: '#FF6B6B', oscuro: '#DC2626', borde: '#7F1D1D' };
    const COLOR_AZUL = { claro: '#60A5FA', oscuro: '#2563EB', borde: '#1E40AF' };

    let texRojo = null;
    let texAzul = null;

    // ---------- Init ----------
    function init(contenedor) {
        limpiar();
        contenedorActual = contenedor;

        leerTema();

        texRojo = crearTexturaTarget(COLOR_ROJO, 'rojo');
        texAzul = crearTexturaTarget(COLOR_AZUL, 'azul');

        escena = new THREE.Scene();
        escena.background = new THREE.Color(T.fondo);
        escena.fog = new THREE.Fog(T.fondo, 26, 60);

        const w = contenedor.clientWidth || 400;
        const h = contenedor.clientHeight || 600;

        camara = new THREE.PerspectiveCamera(64, w / h, 0.1, 200);
        camara.position.set(0, 2.4, 0);
        camara.lookAt(0, 2.0, -10);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        contenedor.appendChild(renderer.domElement);

        escena.add(new THREE.AmbientLight(T.acentoClaro, 0.9));
        const dir = new THREE.DirectionalLight(0xfff0d0, 1.15);
        dir.position.set(5, 10, 5);
        escena.add(dir);
        const dir2 = new THREE.DirectionalLight(T.acento, 0.6);
        dir2.position.set(-5, 5, -10);
        escena.add(dir2);

        const sueloGeo = new THREE.PlaneGeometry(80, 80);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: T.fondoSec,
            roughness: 0.92,
            metalness: 0.08
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, -20);
        escena.add(suelo);

        const gridHelper = new THREE.GridHelper(60, 30, T.acento, T.acentoOscuro);
        gridHelper.position.set(0, 0.02, -20);
        gridHelper.material.opacity = 0.32;
        gridHelper.material.transparent = true;
        escena.add(gridHelper);

        const aceraGeo = new THREE.BoxGeometry(20, 0.15, 5);
        const aceraMat = new THREE.MeshStandardMaterial({
            color: T.edificio,
            roughness: 0.85
        });
        const acera = new THREE.Mesh(aceraGeo, aceraMat);
        acera.position.set(0, 0.075, -1.5);
        escena.add(acera);

        construirEstrellas();
        construirCiudad();
        construirCochesDeFondo();
        construirLuciernagas();

        render();
    }

    // ---------- Estrellas ----------
    function construirEstrellas() {
        grupoEstrellas = new THREE.Group();
        const cantidad = 180;
        const geo = new THREE.BufferGeometry();
        const posiciones = new Float32Array(cantidad * 3);
        for (let i = 0; i < cantidad; i++) {
            posiciones[i * 3 + 0] = (Math.random() - 0.5) * 100;
            posiciones[i * 3 + 1] = 6 + Math.random() * 30;
            posiciones[i * 3 + 2] = -30 - Math.random() * 40;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
        const mat = new THREE.PointsMaterial({
            color: T.estrella,
            size: 0.15,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            fog: false
        });
        const puntos = new THREE.Points(geo, mat);
        grupoEstrellas.add(puntos);
        escena.add(grupoEstrellas);
    }

    // ---------- Ciudad ----------
    function construirCiudad() {
        grupoCiudad = new THREE.Group();
        edificiosEmissive = [];
        ventanasNeon = [];

        const lados = [-1, 1];
        for (const lado of lados) {
            for (let i = 0; i < 18; i++) {
                const ancho = 2.2 + Math.random() * 2.5;
                const alto = 5 + Math.random() * 9;
                const prof = 2.2 + Math.random() * 1.5;
                const x = lado * (9 + Math.random() * 3);
                const z = -12 - i * 3.2 - Math.random() * 1;

                const color = (Math.random() < 0.5 ? T.edificio : T.edificioOscuro);
                const emissive = (Math.random() < 0.4 ? T.acento : T.acentoOscuro);
                const emissiveIntensity = 0.05 + Math.random() * 0.15;

                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.85,
                    metalness: 0.15,
                    emissive: emissive,
                    emissiveIntensity: emissiveIntensity
                });
                const geo = new THREE.BoxGeometry(ancho, alto, prof);
                const m = new THREE.Mesh(geo, mat);
                m.position.set(x, alto / 2, z);
                grupoCiudad.add(m);
                edificiosEmissive.push({
                    mat,
                    baseIntensity: emissiveIntensity,
                    fase: Math.random() * Math.PI * 2
                });

                const ventanasCant = Math.floor(alto / 1.2);
                for (let v = 0; v < ventanasCant; v++) {
                    if (Math.random() < 0.55) {
                        const wColor = [T.neon1, T.neon2, T.neon3, T.acentoClaro][
                            Math.floor(Math.random() * 4)
                        ];
                        const wGeo = new THREE.PlaneGeometry(0.28, 0.4);
                        const wMat = new THREE.MeshBasicMaterial({
                            color: wColor,
                            transparent: true,
                            opacity: 0.85,
                            side: THREE.DoubleSide
                        });
                        const w = new THREE.Mesh(wGeo, wMat);
                        const offset = (lado > 0) ? -ancho / 2 - 0.01 : ancho / 2 + 0.01;
                        w.position.set(x + offset, 0.8 + v * 1.15, z);
                        w.rotation.y = lado > 0 ? Math.PI : 0;
                        grupoCiudad.add(w);
                        ventanasNeon.push({
                            mat: wMat,
                            baseOpacity: 0.85,
                            fase: Math.random() * Math.PI * 2,
                            vel: 0.5 + Math.random() * 1.5
                        });
                    }
                }
            }
        }

        for (let i = 0; i < 25; i++) {
            const alto = 4 + Math.random() * 10;
            const ancho = 1.8 + Math.random() * 3;
            const x = (Math.random() - 0.5) * 60;
            const z = -55 - Math.random() * 15;

            const mat = new THREE.MeshStandardMaterial({
                color: T.edificioOscuro,
                roughness: 0.9,
                emissive: T.acentoOscuro,
                emissiveIntensity: 0.03
            });
            const geo = new THREE.BoxGeometry(ancho, alto, 2);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, alto / 2, z);
            grupoCiudad.add(m);
        }

        escena.add(grupoCiudad);
    }

    // ---------- Coches de fondo ----------
    function construirCochesDeFondo() {
        grupoCoches = new THREE.Group();
        cochesDeFondo = [];

        const colores = [T.neon1, T.neon2, T.neon3, T.acentoClaro];

        for (let i = 0; i < 6; i++) {
            const lado = i % 2 === 0 ? -1 : 1;
            const color = colores[i % colores.length];
            const geo = new THREE.BoxGeometry(1.6, 0.5, 0.9);
            const mat = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.7,
                roughness: 0.6
            });
            const coche = new THREE.Mesh(geo, mat);
            const z = -28 - i * 2.5;
            const xIni = (Math.random() - 0.5) * 40;
            coche.position.set(xIni, 0.35, z);
            grupoCoches.add(coche);
            cochesDeFondo.push({
                mesh: coche,
                vel: (lado > 0 ? 1 : -1) * (3 + Math.random() * 3),
                limite: 22,
                x: xIni
            });
        }

        escena.add(grupoCoches);
    }

    // ---------- Luciérnagas ----------
    function construirLuciernagas() {
        grupoLuciernagas = new THREE.Group();
        luciernagas = [];
        const cantidad = 30;

        for (let i = 0; i < cantidad; i++) {
            const color = [T.acentoClaro, T.acento, T.neon3][Math.floor(Math.random() * 3)];
            const geo = new THREE.SphereGeometry(0.06, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.85
            });
            const l = new THREE.Mesh(geo, mat);
            const x = (Math.random() - 0.5) * 14;
            const y = 1 + Math.random() * 4;
            const z = -5 - Math.random() * 20;
            l.position.set(x, y, z);
            grupoLuciernagas.add(l);
            luciernagas.push({
                mesh: l,
                x, y, z,
                velX: (Math.random() - 0.5) * 0.4,
                velY: 0.15 + Math.random() * 0.25,
                velZ: (Math.random() - 0.5) * 0.3,
                fase: Math.random() * Math.PI * 2,
                baseOpacity: 0.6 + Math.random() * 0.3
            });
        }

        escena.add(grupoLuciernagas);
    }

    // ---------- Crear target ----------
    function crearTarget(tipo) {
        const tex = tipo === 'rojo' ? texRojo : texAzul;
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            fog: true
        });
        const sprite = new THREE.Sprite(mat);

        const desdeIzquierda = Math.random() < 0.5;
        const xIni = desdeIzquierda ? -X_MAX - 0.5 : X_MAX + 0.5;
        const y = Y_SUELO + (Math.random() - 0.5) * Y_MAX_DESVIO;
        const z = Z_MIN + Math.random() * (Z_MAX - Z_MIN);

        const escala = 0.9 + (z - Z_MIN) / (Z_MAX - Z_MIN) * 0.5;

        sprite.position.set(xIni, y, z);
        sprite.scale.set(escala * 0.2, escala * 0.2, 1);

        escena.add(sprite);

        const velCaminar = (desdeIzquierda ? 1 : -1) * (1.3 + Math.random() * 0.9);

        const target = {
            id: proximoId++,
            tipo,
            sprite,
            x: xIni, y, z,
            vx: velCaminar,
            vy: 0,
            escala,
            radio: escala * 0.55,
            vidaMs: 0,
            vidaMaxMs: 3600,
            muerto: false,
            apareciendoMs: 220,
            bobFase: Math.random() * Math.PI * 2
        };

        targets.push(target);
        return target;
    }

    // ---------- Update ----------
    function update(dt) {
        tiempo += dt;

        for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i];

            if (t.apareciendoMs > 0) {
                t.apareciendoMs -= dt * 1000;
                const p = Math.max(0, 1 - t.apareciendoMs / 220);
                const ease = 1 - Math.pow(1 - p, 3);
                const s = t.escala * (0.2 + 0.8 * ease);
                t.sprite.scale.set(s, s, 1);
            }

            t.vidaMs += dt * 1000;
            if (t.vidaMs >= t.vidaMaxMs) {
                animarDespawn(t);
                targets.splice(i, 1);
                continue;
            }

            if (t.vidaMaxMs - t.vidaMs < 400) {
                t.sprite.material.opacity = (Math.sin(t.vidaMs / 40) > 0) ? 0.4 : 1;
            }

            t.x += t.vx * dt;

            if (t.x > X_MAX) { t.x = X_MAX; t.vx = -Math.abs(t.vx); }
            if (t.x < -X_MAX) { t.x = -X_MAX; t.vx = Math.abs(t.vx); }

            t.bobFase += dt * 8;
            const bob = Math.sin(t.bobFase) * 0.06;

            t.sprite.position.set(t.x, t.y + bob, t.z);
        }

        cochesDeFondo.forEach(c => {
            c.x += c.vel * dt;
            if (c.x > c.limite) c.x = -c.limite;
            if (c.x < -c.limite) c.x = c.limite;
            c.mesh.position.x = c.x;
        });

        luciernagas.forEach(l => {
            l.x += l.velX * dt;
            l.y += l.velY * dt;
            l.z += l.velZ * dt;

            if (l.y > 5.5) { l.y = 1; l.x = (Math.random() - 0.5) * 14; }
            if (l.x > 8) l.x = -8;
            if (l.x < -8) l.x = 8;
            if (l.z > -4) l.z = -25;
            if (l.z < -25) l.z = -4;

            l.fase += dt * 2;
            const op = l.baseOpacity + Math.sin(l.fase) * 0.25;
            l.mesh.material.opacity = Math.max(0, Math.min(1, op));

            l.mesh.position.set(l.x, l.y, l.z);
        });

        edificiosEmissive.forEach(e => {
            e.mat.emissiveIntensity = e.baseIntensity + Math.sin(tiempo * 0.8 + e.fase) * 0.05;
        });

        ventanasNeon.forEach(v => {
            v.mat.opacity = v.baseOpacity * (0.6 + 0.4 * Math.abs(Math.sin(tiempo * v.vel + v.fase)));
        });

        if (grupoEstrellas) {
            grupoEstrellas.rotation.y = tiempo * 0.01;
        }

        render();
    }

    function animarDespawn(t) {
        const baseEscala = t.sprite.scale.x;
        const startTime = performance.now();
        const durMs = 180;

        function step() {
            if (!t.sprite || !t.sprite.parent) return;
            const ms = performance.now() - startTime;
            const p = Math.min(1, ms / durMs);
            const ease = p * p;
            const s = baseEscala * (1 - ease);
            t.sprite.scale.set(s, s, 1);
            t.sprite.material.opacity = 1 - ease;
            if (p < 1) requestAnimationFrame(step);
            else {
                if (t.sprite.parent) escena.remove(t.sprite);
                t.sprite.material.dispose();
            }
        }
        requestAnimationFrame(step);
    }

    function matarTarget(target, esAcierto) {
        const idx = targets.indexOf(target);
        if (idx === -1) return;
        targets.splice(idx, 1);

        const baseEscala = target.sprite.scale.x;
        const startTime = performance.now();
        const durMs = 220;

        function step() {
            if (!target.sprite || !target.sprite.parent) return;
            const p = Math.min(1, (performance.now() - startTime) / durMs);
            const ease = 1 - Math.pow(1 - p, 3);
            const s = baseEscala * (1 + ease * 0.8);
            target.sprite.scale.set(s, s, 1);
            target.sprite.material.opacity = 1 - ease;
            if (p < 1) requestAnimationFrame(step);
            else {
                if (target.sprite.parent) escena.remove(target.sprite);
                target.sprite.material.dispose();
            }
        }
        requestAnimationFrame(step);
    }

    function proyectarTarget(t) {
        const v = new THREE.Vector3(t.x, t.y + 0.06, t.z);
        v.project(camara);
        const rect = contenedorActual.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    function radioEnPantalla(t) {
        const c = new THREE.Vector3(t.x, t.y, t.z).project(camara);
        const e = new THREE.Vector3(t.x + t.radio, t.y, t.z).project(camara);
        const rect = contenedorActual.getBoundingClientRect();
        return Math.abs(e.x - c.x) * 0.5 * rect.width;
    }

    function limpiar() {
        targets.forEach(t => {
            if (t.sprite && t.sprite.parent) escena?.remove(t.sprite);
        });
        targets = [];
        cochesDeFondo = [];
        luciernagas = [];
        ventanasNeon = [];
        edificiosEmissive = [];
        if (renderer && contenedorActual) {
            try { contenedorActual.removeChild(renderer.domElement); } catch (e) {}
            renderer.dispose();
            renderer = null;
        }
        escena = null;
        camara = null;
        if (contenedorActual) contenedorActual.innerHTML = '';
    }

    function render() {
        if (renderer && escena && camara) renderer.render(escena, camara);
    }

    function onResize() {
        if (!renderer || !camara || !contenedorActual) return;
        const w = contenedorActual.clientWidth || 400;
        const h = contenedorActual.clientHeight || 600;
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
        renderer.setSize(w, h);
        render();
    }

    window.CL_Escena = {
        init,
        crearTarget,
        update,
        matarTarget,
        proyectarTarget,
        radioEnPantalla,
        obtenerTargets: () => targets,
        limpiar,
        render,
        onResize
    };
})();
