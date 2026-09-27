// ============================================================
//  Caloluty — Escena Three.js
//  ------------------------------------------------------------
//  · Cámara fija en el centro, mira hacia -Z
//  · Objetivos aparecen como sprites que siempre miran a cámara
//  · Viewmodel del arma NO está acá: es un div en el DOM
// ============================================================

(function () {
    'use strict';

    const Z_MIN = -22;
    const Z_MAX = -8;
    const X_MAX = 4.5;
    const Y_MIN = 0.8;
    const Y_MAX = 3.6;

    let escena = null;
    let camara = null;
    let renderer = null;
    let contenedorActual = null;

    let spriteRojos = [];
    let spriteAzules = [];
    let targets = [];   // {id, tipo, sprite, x, y, z, velX, velY, radio, spawnTime}
    let proximoId = 1;
    let tiempo = 0;

    // ---------- Texturas ----------
    function crearTexturaTarget(color, tipo) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');

        // Círculo base
        const grad = c.createRadialGradient(64, 64, 10, 64, 64, 62);
        grad.addColorStop(0, color.claro);
        grad.addColorStop(1, color.oscuro);
        c.fillStyle = grad;
        c.beginPath();
        c.arc(64, 64, 60, 0, Math.PI * 2);
        c.fill();

        // Aro exterior
        c.strokeStyle = color.borde;
        c.lineWidth = 5;
        c.beginPath();
        c.arc(64, 64, 57, 0, Math.PI * 2);
        c.stroke();

        // Icono dentro
        c.strokeStyle = '#FFFFFF';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.lineJoin = 'round';

        if (tipo === 'rojo') {
            // Diana: círculos concéntricos + cruz
            c.beginPath();
            c.arc(64, 64, 34, 0, Math.PI * 2);
            c.stroke();
            c.beginPath();
            c.arc(64, 64, 14, 0, Math.PI * 2);
            c.stroke();
            c.beginPath();
            c.moveTo(64, 20); c.lineTo(64, 42);
            c.moveTo(64, 86); c.lineTo(64, 108);
            c.moveTo(20, 64); c.lineTo(42, 64);
            c.moveTo(86, 64); c.lineTo(108, 64);
            c.stroke();
        } else {
            // Azul: escudo (recordatorio de "no dispares")
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

    const COLOR_ROJO = {
        claro: '#FF6B6B',
        oscuro: '#DC2626',
        borde: '#7F1D1D'
    };
    const COLOR_AZUL = {
        claro: '#60A5FA',
        oscuro: '#2563EB',
        borde: '#1E40AF'
    };

    let texRojo = null;
    let texAzul = null;

    // ---------- Init ----------
    function init(contenedor) {
        limpiar();
        contenedorActual = contenedor;

        texRojo = crearTexturaTarget(COLOR_ROJO, 'rojo');
        texAzul = crearTexturaTarget(COLOR_AZUL, 'azul');

        escena = new THREE.Scene();
        escena.background = new THREE.Color(0x1a0e2e);
        escena.fog = new THREE.Fog(0x1a0e2e, 30, 70);

        const w = contenedor.clientWidth || 400;
        const h = contenedor.clientHeight || 600;

        camara = new THREE.PerspectiveCamera(62, w / h, 0.1, 200);
        camara.position.set(0, 2.2, 0);
        camara.lookAt(0, 2.2, -10);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        contenedor.appendChild(renderer.domElement);

        // Luces
        escena.add(new THREE.AmbientLight(0xa78bfa, 1.0));
        const dir = new THREE.DirectionalLight(0xfff0d0, 1.2);
        dir.position.set(5, 10, 5);
        escena.add(dir);
        const dir2 = new THREE.DirectionalLight(0x7c3aed, 0.5);
        dir2.position.set(-5, 5, -10);
        escena.add(dir2);

        // Suelo
        const sueloGeo = new THREE.PlaneGeometry(80, 80);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: 0x241540,
            roughness: 0.9,
            metalness: 0.1
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, -20);
        escena.add(suelo);

        // Paredes laterales (silueta urbana low-poly)
        const edifMat = new THREE.MeshStandardMaterial({
            color: 0x16082a,
            roughness: 0.85,
            emissive: 0x7c3aed,
            emissiveIntensity: 0.08
        });
        for (let i = 0; i < 14; i++) {
            const lado = i % 2 === 0 ? -1 : 1;
            const alto = 4 + Math.random() * 6;
            const ancho = 2 + Math.random() * 3;
            const geo = new THREE.BoxGeometry(ancho, alto, 3);
            const m = new THREE.Mesh(geo, edifMat);
            m.position.set(lado * (10 + Math.random() * 6), alto / 2, -15 - i * 4);
            escena.add(m);
        }

        // Piso con marcas (grid de neón)
        const gridHelper = new THREE.GridHelper(60, 30, 0x7c3aed, 0x4c1d95);
        gridHelper.position.set(0, 0.02, -20);
        gridHelper.material.opacity = 0.35;
        gridHelper.material.transparent = true;
        escena.add(gridHelper);

        render();
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

        // Posición inicial aleatoria
        const x = (Math.random() - 0.5) * X_MAX * 1.7;
        const y = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
        const z = Z_MIN + Math.random() * (Z_MAX - Z_MIN);

        // Escala según profundidad (más lejos = más chico naturalmente por perspectiva,
        // pero igual queremos un poco más chico si está lejos)
        const escala = 0.85 + (z - Z_MIN) / (Z_MAX - Z_MIN) * 0.5;

        sprite.position.set(x, y, z);
        sprite.scale.set(escala, escala, 1);

        escena.add(sprite);

        // Velocidad de deriva (horizontal o vertical)
        const ejeH = Math.random() < 0.5;
        const vel = (Math.random() * 1.6 + 0.8) * (Math.random() < 0.5 ? -1 : 1);

        const target = {
            id: proximoId++,
            tipo,
            sprite,
            x, y, z,
            vx: ejeH ? vel : 0,
            vy: ejeH ? 0 : vel * 0.6,
            radio: escala * 0.55,
            vidaMs: 0,
            vidaMaxMs: 3200,
            muerto: false,
            apareciendoMs: 200
        };

        targets.push(target);

        // Animación de aparición
        sprite.scale.set(escala * 0.2, escala * 0.2, 1);

        return target;
    }

    // ---------- Update ----------
    function update(dt) {
        tiempo += dt;

        for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i];

            // Aparecer
            if (t.apareciendoMs > 0) {
                t.apareciendoMs -= dt * 1000;
                const p = Math.max(0, 1 - t.apareciendoMs / 200);
                const baseEscala = 0.85 + (t.z - Z_MIN) / (Z_MAX - Z_MIN) * 0.5;
                const ease = 1 - Math.pow(1 - p, 3);
                t.sprite.scale.set(
                    baseEscala * (0.2 + 0.8 * ease),
                    baseEscala * (0.2 + 0.8 * ease),
                    1
                );
            }

            // Vida
            t.vidaMs += dt * 1000;
            if (t.vidaMs >= t.vidaMaxMs) {
                animarDespawn(t);
                targets.splice(i, 1);
                continue;
            }

            // Últimos 400ms: parpadea
            if (t.vidaMaxMs - t.vidaMs < 400) {
                const flash = Math.sin(t.vidaMs / 40) > 0;
                t.sprite.material.opacity = flash ? 0.4 : 1;
            }

            // Mover
            t.x += t.vx * dt;
            t.y += t.vy * dt;

            // Rebotar dentro de límites
            if (t.x > X_MAX * 0.9) { t.x = X_MAX * 0.9; t.vx = -Math.abs(t.vx); }
            if (t.x < -X_MAX * 0.9) { t.x = -X_MAX * 0.9; t.vx = Math.abs(t.vx); }
            if (t.y > Y_MAX) { t.y = Y_MAX; t.vy = -Math.abs(t.vy); }
            if (t.y < Y_MIN) { t.y = Y_MIN; t.vy = Math.abs(t.vy); }

            t.sprite.position.set(t.x, t.y, t.z);
        }

        render();
    }

    function animarDespawn(t) {
        // Simple: fadeout + shrink
        const baseEscala = t.sprite.scale.x;
        let ms = 0;
        const durMs = 180;
        const startTime = performance.now();

        function step() {
            if (!t.sprite || !t.sprite.parent) return;
            ms = performance.now() - startTime;
            const p = Math.min(1, ms / durMs);
            const ease = p * p;
            const s = baseEscala * (1 - ease);
            t.sprite.scale.set(s, s, 1);
            t.sprite.material.opacity = 1 - ease;
            if (p < 1) {
                requestAnimationFrame(step);
            } else {
                if (t.sprite.parent) escena.remove(t.sprite);
                t.sprite.material.dispose();
            }
        }
        requestAnimationFrame(step);
    }

    // ---------- Despawn por impacto ----------
    function matarTarget(target, esAcierto) {
        const idx = targets.indexOf(target);
        if (idx === -1) return;
        targets.splice(idx, 1);

        // Animación de muerte
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
            if (p < 1) {
                requestAnimationFrame(step);
            } else {
                if (target.sprite.parent) escena.remove(target.sprite);
                target.sprite.material.dispose();
            }
        }
        requestAnimationFrame(step);
    }

    // ---------- Convertir posición 3D a 2D pantalla ----------
    function proyectarTarget(t) {
        const v = new THREE.Vector3(t.x, t.y, t.z);
        v.project(camara);
        const rect = contenedorActual.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    function radioEnPantalla(t) {
        // Proyectamos dos puntos: centro y borde
        const c = new THREE.Vector3(t.x, t.y, t.z).project(camara);
        const e = new THREE.Vector3(t.x + t.radio, t.y, t.z).project(camara);
        const rect = contenedorActual.getBoundingClientRect();
        return Math.abs(e.x - c.x) * 0.5 * rect.width;
    }

    // ---------- Limpieza / resize / render ----------
    function limpiar() {
        targets.forEach(t => {
            if (t.sprite && t.sprite.parent) escena?.remove(t.sprite);
        });
        targets = [];
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
        if (renderer && escena && camara) {
            renderer.render(escena, camara);
        }
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

    // ---------- Exponer ----------
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
