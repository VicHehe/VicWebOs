// ============================================================
//  Vagonetas — Capa visual con CURVAS DISCRETAS
//  ------------------------------------------------------------
//  El track es recto… recto… ¡curva!… recto…
//  Las curvas están pre-generadas como segmentos. Se ven desde
//  lejos y se toman solas (el jugador no hace nada).
//
//  Estrategia técnica:
//  · `curvaMundo(z)` devuelve el offset X en world-Z
//  · Los rieles/durmientes/postes/decoración viven en `mundoGroup`
//  · `mundoGroup.position.z = progreso` (el mundo pasa, no el jugador)
//  · El jugador está en Z=0 local siempre
//  · La cámara sigue la curva con lerp para efecto cinematográfico
// ============================================================

(function () {
    'use strict';

    const CARRILES_X = [-4, -2, 0, 2, 4];
    const CANT_CARRILES = 5;

    // ---- Segmentos de curva (mundo) ----
    let curvaSegmentos = [];

    function generarCurvas() {
        curvaSegmentos = [];
        let z = 60;    // empezamos un poco detrás del jugador
        let x = 0;

        while (z > -900) {
            // Tramo recto (60-100m)
            const largRecto = 60 + Math.random() * 40;
            curvaSegmentos.push({
                z1: z, z2: z - largRecto,
                x1: x, x2: x
            });
            z -= largRecto;

            // 70% de las veces metemos una curva
            if (Math.random() < 0.70) {
                const lado = Math.random() < 0.5 ? -1 : 1;
                const dx = lado * (6 + Math.random() * 4);     // ±6-10 unidades
                const largCurva = 35 + Math.random() * 15;     // 35-50m
                curvaSegmentos.push({
                    z1: z, z2: z - largCurva,
                    x1: x, x2: x + dx
                });
                z -= largCurva;
                x += dx;
            }
        }
    }

    function curvaMundo(zMundo) {
        if (curvaSegmentos.length === 0) return 0;
        for (let i = 0; i < curvaSegmentos.length; i++) {
            const s = curvaSegmentos[i];
            if (zMundo <= s.z1 && zMundo >= s.z2) {
                const t = (s.z1 - zMundo) / (s.z1 - s.z2);
                const ts = t * t * (3 - 2 * t);  // smoothstep
                return s.x1 + (s.x2 - s.x1) * ts;
            }
        }
        // Fuera de rango
        if (zMundo < curvaSegmentos[curvaSegmentos.length - 1].z2) {
            return curvaSegmentos[curvaSegmentos.length - 1].x2;
        }
        return 0;
    }

    // ---- Refs ----
    let escena = null;
    let camara = null;
    let renderer = null;
    let contenedorActual = null;
    let mapaActual = null;

    let mundoGroup = null;
    let carritoJugador = null;
    let carritosRivales = [];
    let grupoObstaculos = null;
    let poolObstaculos = [];
    let decoracionesAnimadas = [];

    // ---- Cámara ----
    let camaraXTarget = 0;
    let camaraXActual = 0;
    let shakeIntensidad = 0;

    // ---------- Init ----------
    function init(contenedor, mapaConfig, jugadorInfo) {
        limpiarEscena();
        contenedorActual = contenedor;
        mapaActual = mapaConfig;

        generarCurvas();

        escena = new THREE.Scene();
        escena.background = new THREE.Color(mapaConfig.cielo);
        escena.fog = new THREE.Fog(
            mapaConfig.niebla.color,
            mapaConfig.niebla.near,
            mapaConfig.niebla.far
        );

        const w = contenedor.clientWidth || 400;
        const h = contenedor.clientHeight || 600;

        camara = new THREE.PerspectiveCamera(62, w / h, 0.1, 600);
        camara.position.set(0, 7.5, 13);
        camara.lookAt(0, 1.6, -10);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        contenedor.appendChild(renderer.domElement);

        // Luces
        escena.add(new THREE.AmbientLight(
            mapaConfig.luzAmb.color,
            mapaConfig.luzAmb.intensidad
        ));
        const dir = new THREE.DirectionalLight(
            mapaConfig.luzDir.color,
            mapaConfig.luzDir.intensidad
        );
        dir.position.set(...mapaConfig.luzDir.pos);
        escena.add(dir);

        // ---- Grupo del MUNDO (todo lo que se mueve con progreso) ----
        mundoGroup = new THREE.Group();
        escena.add(mundoGroup);

        // Suelo extendido
        const sueloGeo = new THREE.PlaneGeometry(200, 1100);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.suelo,
            roughness: 0.95,
            metalness: 0.05
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, -450);
        mundoGroup.add(suelo);

        // Rieles, durmientes, postes (todo en el mundoGroup)
        construirRieles(mapaConfig);
        construirDurmientes(mapaConfig);
        construirPostes(mapaConfig);
        construirDecoracion(mapaConfig);

        // ---- Grupo de obstáculos (fuera del mundoGroup, son relativos al jugador) ----
        grupoObstaculos = new THREE.Group();
        escena.add(grupoObstaculos);

        // ---- Carrito del jugador ----
        carritoJugador = crearCarrito(mapaConfig.jugador, jugadorInfo, false);
        escena.add(carritoJugador);

        // ---- Rivales ----
        carritosRivales = [];
        for (let i = 0; i < 2; i++) {
            const color = i === 0 ? mapaConfig.rival1 : mapaConfig.rival2;
            const c = crearCarrito(color, null, true);
            escena.add(c);
            carritosRivales.push(c);
        }

        camaraXActual = curvaMundo(0);
        camaraXTarget = camaraXActual;

        render();
    }

    // ---------- Rieles curvos ----------
    function construirRieles(mapaConfig) {
        const rielMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.riel,
            metalness: 0.75,
            roughness: 0.3,
            emissive: mapaConfig.riel,
            emissiveIntensity: 0.28
        });

        const Z_INI = 20;
        const Z_FIN = -900;
        const SEG = 300;
        const step = (Z_INI - Z_FIN) / SEG;
        const offsetLateral = 0.5;
        const anchoRiel = 0.09;
        const altoRiel = 0.07;

        const cantidad = SEG * 2 * CANT_CARRILES;
        const geo = new THREE.BoxGeometry(anchoRiel, altoRiel, Math.abs(step) * 1.05);
        const instanced = new THREE.InstancedMesh(geo, rielMat, cantidad);
        const dummy = new THREE.Object3D();
        let idx = 0;

        CARRILES_X.forEach(xCarril => {
            [-offsetLateral, offsetLateral].forEach(off => {
                for (let i = 0; i < SEG; i++) {
                    const z1 = Z_INI - i * Math.abs(step);
                    const z2 = z1 - Math.abs(step);
                    const x1 = xCarril + off + curvaMundo(z1);
                    const x2 = xCarril + off + curvaMundo(z2);
                    const xm = (x1 + x2) / 2;
                    const zm = (z1 + z2) / 2;
                    const dx = x2 - x1;
                    const dz = z2 - z1;
                    dummy.position.set(xm, 0.08, zm);
                    dummy.rotation.set(0, Math.atan2(dx, -dz), 0);
                    dummy.updateMatrix();
                    instanced.setMatrixAt(idx++, dummy.matrix);
                }
            });
        });

        mundoGroup.add(instanced);
    }

    function construirDurmientes(mapaConfig) {
        const geo = new THREE.BoxGeometry(2.0, 0.06, 0.28);
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.9
        });
        const Z_INI = 20;
        const step = 5;
        const cantidadPorCarril = Math.floor((-Z_INI + 900) / step);
        const total = cantidadPorCarril * CANT_CARRILES;
        const instanced = new THREE.InstancedMesh(geo, mat, total);
        const dummy = new THREE.Object3D();
        let idx = 0;

        CARRILES_X.forEach(xCarril => {
            for (let i = 0; i < cantidadPorCarril; i++) {
                const z = Z_INI - i * step;
                const x = xCarril + curvaMundo(z);
                dummy.position.set(x, 0.04, z);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            }
        });
        mundoGroup.add(instanced);
    }

    function construirPostes(mapaConfig) {
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.6,
            metalness: 0.35,
            emissive: mapaConfig.rielMetal,
            emissiveIntensity: 0.15
        });
        const geo = new THREE.BoxGeometry(0.2, 2.2, 0.2);
        const step = 8;
        const cantidad = Math.floor((-20 + 900) / step);
        const instanced = new THREE.InstancedMesh(geo, mat, cantidad * 2);
        const dummy = new THREE.Object3D();
        let idx = 0;

        for (let i = 0; i < cantidad; i++) {
            const z = 20 - i * step;
            const c = curvaMundo(z);
            [-5.8, 5.8].forEach(x => {
                dummy.position.set(x + c, 1.1, z);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            });
        }
        mundoGroup.add(instanced);
    }

    // ---------- Decoración por mapa ----------
    function construirDecoracion(mapaConfig) {
        decoracionesAnimadas = [];
        const tipo = mapaConfig.decoracion;
        const color = mapaConfig.decoColor;

        if (tipo === 'sol') {
            // Sol gigante + halo
            const solGeo = new THREE.CircleGeometry(32, 48);
            const solMat = new THREE.MeshBasicMaterial({
                color: 0xffe0c4,
                transparent: true,
                opacity: 0.92
            });
            const sol = new THREE.Mesh(solGeo, solMat);
            sol.position.set(0, 22, -420);
            mundoGroup.add(sol);

            const haloGeo = new THREE.CircleGeometry(46, 48);
            const haloMat = new THREE.MeshBasicMaterial({
                color: 0xffb890,
                transparent: true,
                opacity: 0.32
            });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            halo.position.set(0, 22, -422);
            mundoGroup.add(halo);
        }

        else if (tipo === 'cristales') {
            const geo = new THREE.OctahedronGeometry(1.4, 0);
            const mat = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.75,
                metalness: 0.35,
                roughness: 0.25,
                transparent: true,
                opacity: 0.92
            });
            const cantidad = 40;
            const instanced = new THREE.InstancedMesh(geo, mat, cantidad);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < cantidad; i++) {
                const z = 20 - i * 22;
                const lado = i % 2 === 0 ? -1 : 1;
                const x = lado * (7 + Math.random() * 5) + curvaMundo(z);
                const y = 2.5 + Math.random() * 4;
                dummy.position.set(x, y, z);
                dummy.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                dummy.scale.setScalar(0.7 + Math.random() * 0.7);
                dummy.updateMatrix();
                instanced.setMatrixAt(i, dummy.matrix);
            }
            mundoGroup.add(instanced);
            decoracionesAnimadas.push({ tipo: 'cristales', mesh: instanced });
        }

        else if (tipo === 'reflectores') {
            const cantidad = 10;
            for (let i = 0; i < cantidad; i++) {
                const z = 15 - i * 60;
                const lado = i % 2 === 0 ? -1 : 1;
                const conoGeo = new THREE.ConeGeometry(3, 18, 16, 1, true);
                const conoMat = new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.16,
                    side: THREE.DoubleSide
                });
                const cono = new THREE.Mesh(conoGeo, conoMat);
                cono.position.set(lado * 8 + curvaMundo(z), 10, z);
                cono.rotation.x = Math.PI;
                mundoGroup.add(cono);
                decoracionesAnimadas.push({
                    tipo: 'reflector',
                    mesh: cono,
                    fase: i * 0.6
                });
            }
        }

        else if (tipo === 'engranajes') {
            const cantidad = 20;
            for (let i = 0; i < cantidad; i++) {
                const z = 15 - i * 45;
                const lado = i % 2 === 0 ? -1 : 1;
                const r = 1.6 + Math.random() * 1.6;
                const geo = new THREE.TorusGeometry(r, r * 0.2, 8, 18);
                const mat = new THREE.MeshStandardMaterial({
                    color,
                    metalness: 0.75,
                    roughness: 0.35,
                    emissive: color,
                    emissiveIntensity: 0.18
                });
                const g = new THREE.Mesh(geo, mat);
                g.position.set(lado * 8 + curvaMundo(z), 4.5 + Math.random() * 3, z);
                g.rotation.y = Math.random() * Math.PI;
                mundoGroup.add(g);
                decoracionesAnimadas.push({
                    tipo: 'engranaje',
                    mesh: g,
                    vel: (i % 2 === 0 ? 1 : -1) * (0.5 + Math.random() * 0.5)
                });
            }
        }
    }

    // ---------- Carrito ----------
    function crearCarrito(color, jugadorInfo, esRival) {
        const group = new THREE.Group();

        // Cuerpo bajo, chico: 1.3 × 0.7 × 2.0
        const cuerpoGeo = new THREE.BoxGeometry(1.3, 0.7, 2.0);
        const cuerpoMat = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.55,
            roughness: 0.45,
            emissive: color,
            emissiveIntensity: 0.12
        });
        const cuerpo = new THREE.Mesh(cuerpoGeo, cuerpoMat);
        cuerpo.position.y = 0.55;
        group.add(cuerpo);

        // Borde superior oscuro
        const bordeGeo = new THREE.BoxGeometry(1.4, 0.1, 2.15);
        const bordeMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
        const borde = new THREE.Mesh(bordeGeo, bordeMat);
        borde.position.y = 0.92;
        group.add(borde);

        // Frente brillante
        const frenteGeo = new THREE.BoxGeometry(1.1, 0.4, 0.06);
        const frenteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.3,
            roughness: 0.3,
            emissive: 0xffffff,
            emissiveIntensity: 0.25
        });
        const frente = new THREE.Mesh(frenteGeo, frenteMat);
        frente.position.set(0, 0.55, -1.01);
        group.add(frente);

        // Ruedas
        const ruedaGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
        const ruedaMat = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.85
        });
        [
            [-0.72, 0.28, -0.7],
            [ 0.72, 0.28, -0.7],
            [-0.72, 0.28,  0.7],
            [ 0.72, 0.28,  0.7]
        ].forEach(p => {
            const r = new THREE.Mesh(ruedaGeo, ruedaMat);
            r.rotation.z = Math.PI / 2;
            r.position.set(...p);
            group.add(r);
        });

        // Disco superior con foto / inicial / "?"
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');

        const colorHex = '#' + color.toString(16).padStart(6, '0');

        if (esRival) {
            c.fillStyle = colorHex;
            c.beginPath();
            c.arc(64, 64, 58, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 84px Nunito, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('?', 64, 72);
        } else if (jugadorInfo && jugadorInfo.foto) {
            c.fillStyle = colorHex;
            c.beginPath();
            c.arc(64, 64, 58, 0, Math.PI * 2);
            c.fill();

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                c.clearRect(0, 0, 128, 128);
                c.save();
                c.beginPath();
                c.arc(64, 64, 62, 0, Math.PI * 2);
                c.clip();
                c.drawImage(img, 0, 0, 128, 128);
                c.restore();
                c.strokeStyle = '#FFFFFF';
                c.lineWidth = 6;
                c.beginPath();
                c.arc(64, 64, 60, 0, Math.PI * 2);
                c.stroke();
                tex.needsUpdate = true;
            };
            img.src = jugadorInfo.foto;
        } else {
            c.fillStyle = colorHex;
            c.beginPath();
            c.arc(64, 64, 58, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 80px Nunito, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            const ini = (jugadorInfo && jugadorInfo.inicial) ? jugadorInfo.inicial : '?';
            c.fillText(ini, 64, 70);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;

        const planeGeo = new THREE.PlaneGeometry(0.7, 0.7);
        const planeMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.set(0, 1.35, 0);
        group.add(plane);

        return group;
    }

    // ---------- Obstáculos ----------
    function obtenerObstaculoDelPool() {
        let o = poolObstaculos.pop();
        if (!o) {
            const geo = new THREE.BoxGeometry(1.05, 0.85, 1.05);
            const mat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculo,
                roughness: 0.7,
                metalness: 0.25,
                emissive: mapaActual.obstaculo,
                emissiveIntensity: 0.2
            });
            o = new THREE.Mesh(geo, mat);

            const bordeGeo = new THREE.BoxGeometry(1.15, 0.12, 1.15);
            const bordeMat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculoB
            });
            const borde = new THREE.Mesh(bordeGeo, bordeMat);
            borde.position.y = 0.5;
            o.add(borde);
        }
        return o;
    }

    function devolverAlPool(mesh) {
        if (mesh.parent) mesh.parent.remove(mesh);
        poolObstaculos.push(mesh);
    }

    // ---------- Update ----------
    function updateEscena(jugadorData, rivalesData, obstaculosData, dt, shakeMs) {
        if (!escena) return;

        const progreso = jugadorData.progreso;

        // Mover el mundo en Z
        mundoGroup.position.z = progreso;

        // Curva del jugador
        const curvaJ = curvaMundo(-progreso);

        // ---- Jugador ----
        if (carritoJugador) {
            const xJ = CARRILES_X[jugadorData.carril];
            // Suavizado al cambiar de carril
            carritoJugador.position.x += (xJ - carritoJugador.position.x) * Math.min(dt * 15, 1);
            carritoJugador.position.z = 0;
            // Tilt al cambiar de carril
            const dx = xJ - carritoJugador.position.x;
            carritoJugador.rotation.z = -dx * 0.08;
        }

        // ---- Rivales ----
        carritosRivales.forEach((c, i) => {
            const r = rivalesData[i];
            if (!r) return;
            const zRel = -(r.progreso - progreso);
            const xR = CARRILES_X[r.carril];
            c.position.x += (xR - c.position.x) * Math.min(dt * 15, 1);
            c.position.z = zRel;
        });

        // ---- Obstáculos ----
        const idsVivos = new Set(obstaculosData.map(o => o.id));
        grupoObstaculos.children.slice().forEach(child => {
            if (!idsVivos.has(child.userData.id)) {
                devolverAlPool(child);
            }
        });

        obstaculosData.forEach(o => {
            let mesh = grupoObstaculos.children.find(c => c.userData.id === o.id);
            if (!mesh) {
                mesh = obtenerObstaculoDelPool();
                mesh.userData.id = o.id;
                grupoObstaculos.add(mesh);
            }
            // X del carril + diferencia de curva entre obstáculo y jugador
            const zMundoObs = -progreso + o.z;
            const curvaObs = curvaMundo(zMundoObs);
            const xFinal = CARRILES_X[o.carril] + (curvaObs - curvaJ);
            mesh.position.set(xFinal, 0.42, o.z);
        });

        // ---- Cámara: sigue la curva (lerp lento) ----
        camaraXTarget = curvaJ;
        camaraXActual += (camaraXTarget - camaraXActual) * Math.min(dt * 4, 1);

        // Shake al chocar
        let shakeX = 0, shakeY = 0;
        if (shakeMs > 0) {
            const intensidad = Math.min(shakeMs / 350, 1) * 0.45;
            shakeX = (Math.random() - 0.5) * intensidad;
            shakeY = (Math.random() - 0.5) * intensidad;
        }

        camara.position.set(camaraXActual + shakeX, 7.5 + shakeY, 13);

        // Look at un punto levemente adelantado en la curva
        const lookAheadX = curvaMundo(-progreso - 20);
        camara.lookAt(
            lookAheadX * 0.6 + camaraXActual * 0.4,
            1.6,
            -10
        );

        // ---- Decoraciones animadas ----
        const t = performance.now() / 1000;
        decoracionesAnimadas.forEach(d => {
            if (d.tipo === 'engranaje') {
                d.mesh.rotation.z += d.vel * dt;
            } else if (d.tipo === 'reflector') {
                d.mesh.rotation.y = Math.sin(t * 0.7 + d.fase) * 0.5;
            } else if (d.tipo === 'cristales') {
                d.mesh.rotation.y = t * 0.2;
            }
        });

        render();
    }

    function render() {
        if (!renderer || !escena || !camara) return;
        renderer.render(escena, camara);
    }

    function limpiarEscena() {
        if (renderer && contenedorActual) {
            try {
                contenedorActual.removeChild(renderer.domElement);
            } catch (e) { /* nada */ }
            renderer.dispose();
            renderer = null;
        }
        escena = null;
        camara = null;
        mundoGroup = null;
        carritoJugador = null;
        carritosRivales = [];
        grupoObstaculos = null;
        poolObstaculos = [];
        decoracionesAnimadas = [];
        curvaSegmentos = [];
        if (contenedorActual) contenedorActual.innerHTML = '';
    }

    function onResize() {
        if (!contenedorActual || !renderer || !camara) return;
        const w = contenedorActual.clientWidth || 400;
        const h = contenedorActual.clientHeight || 600;
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
        renderer.setSize(w, h);
        render();
    }

    window.VG_Escena = {
        CARRILES_X,
        curvaMundo,
        init,
        updateEscena,
        limpiarEscena,
        render,
        onResize
    };
})();
