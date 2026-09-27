// ============================================================
//  Vagonetas — Capa visual (Three.js) con curvas y decoraciones
//  ------------------------------------------------------------
//  El track NO es recto. La función `curva(z)` desplaza en X
//  todos los elementos según su Z. Así se siente serpenteante.
//
//  5 carriles: X = [-4, -2, 0, 2, 4]
//  Cámara sigue la curva al 30% para dar sensación de giro.
// ============================================================

(function () {
    'use strict';

    const CARRILES_X = [-4, -2, 0, 2, 4];
    const CARRILES = [0, 1, 2, 3, 4];

    // Curva del track: suma de dos senoidales. Normalizada para que
    // curva(0) = 0 (el jugador en Z=0 queda en su X de carril puro).
    const CURVA_A_FREQ  = 0.0075;
    const CURVA_A_AMP   = 3.8;
    const CURVA_B_FREQ  = 0.0028;
    const CURVA_B_AMP   = 1.6;
    const CURVA_B_PHASE = 1.1;
    const CURVA_OFFSET  = Math.sin(0) * CURVA_A_AMP +
                          Math.sin(0 + CURVA_B_PHASE) * CURVA_B_AMP;

    function curva(z) {
        return (
            Math.sin(z * CURVA_A_FREQ) * CURVA_A_AMP +
            Math.sin(z * CURVA_B_FREQ + CURVA_B_PHASE) * CURVA_B_AMP -
            CURVA_OFFSET
        );
    }

    let escena = null;
    let camara = null;
    let renderer = null;
    let contenedorActual = null;
    let mapaActual = null;

    let carritoJugador = null;
    let carritosRivales = [];
    let grupoMundo = null;
    let poolObstaculos = [];
    let decoracionesAnimadas = [];

    // ---------- Init ----------
    function init(contenedor, mapaConfig, jugadorInfo) {
        limpiarEscena();
        contenedorActual = contenedor;
        mapaActual = mapaConfig;

        escena = new THREE.Scene();
        escena.background = new THREE.Color(mapaConfig.cielo);
        escena.fog = new THREE.Fog(
            mapaConfig.niebla.color,
            mapaConfig.niebla.near,
            mapaConfig.niebla.far
        );

        const w = contenedor.clientWidth || 400;
        const h = contenedor.clientHeight || 600;

        camara = new THREE.PerspectiveCamera(62, w / h, 0.1, 500);
        camara.position.set(0, 7, 12.5);

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

        // Suelo extendido
        const sueloGeo = new THREE.PlaneGeometry(120, 700);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.suelo,
            roughness: 0.95,
            metalness: 0.05
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, -250);
        escena.add(suelo);

        // Rieles curvos (InstancedMesh)
        construirRieles(mapaConfig);

        // Durmientes curvos
        construirDurmientes(mapaConfig);

        // Postes laterales (dan sensación de velocidad)
        construirPostes(mapaConfig);

        // Decoración por mapa
        construirDecoracion(mapaConfig);

        // Grupo obstáculos
        grupoMundo = new THREE.Group();
        escena.add(grupoMundo);

        // Carrito del jugador
        carritoJugador = crearCarrito(mapaConfig.jugador, jugadorInfo, false);
        escena.add(carritoJugador);

        // Rivales (con "?")
        carritosRivales = [];
        for (let i = 0; i < 2; i++) {
            const color = i === 0 ? mapaConfig.rival1 : mapaConfig.rival2;
            const c = crearCarrito(color, null, true);
            escena.add(c);
            carritosRivales.push(c);
        }

        render();
    }

    // ---------- Rieles curvos ----------
    function construirRieles(mapaConfig) {
        const rielMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.riel,
            metalness: 0.7,
            roughness: 0.35,
            emissive: mapaConfig.riel,
            emissiveIntensity: 0.25
        });

        const SEG = 220;              // segmentos por riel
        const LARGO = 640;            // longitud total
        const step = LARGO / SEG;
        const rielesPorCarril = 2;
        const offsetLateral = 0.55;   // mitad de ancho del carril
        const cantidad = SEG * rielesPorCarril * CARRILES.length;

        // Geo: caja alineada a Z (lado largo = Z)
        const geo = new THREE.BoxGeometry(0.1, 0.08, step * 1.05);
        const instanced = new THREE.InstancedMesh(geo, rielMat, cantidad);

        const dummy = new THREE.Object3D();
        let idx = 0;

        CARRILES_X.forEach(xCarril => {
            [-offsetLateral, offsetLateral].forEach(off => {
                for (let i = 0; i < SEG; i++) {
                    const z1 = 15 - i * step;
                    const z2 = z1 - step;
                    const x1 = xCarril + off + curva(z1);
                    const x2 = xCarril + off + curva(z2);
                    const xm = (x1 + x2) / 2;
                    const zm = (z1 + z2) / 2;

                    dummy.position.set(xm, 0.08, zm);
                    // Rotación para alinear al tramo
                    const dx = x2 - x1;
                    const dz = z2 - z1;
                    dummy.rotation.set(0, Math.atan2(dx, -dz), 0);
                    dummy.updateMatrix();
                    instanced.setMatrixAt(idx++, dummy.matrix);
                }
            });
        });

        escena.add(instanced);
    }

    // ---------- Durmientes ----------
    function construirDurmientes(mapaConfig) {
        const geo = new THREE.BoxGeometry(2.0, 0.06, 0.28);
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.9
        });
        const cantidadPorCarril = 130;
        const total = cantidadPorCarril * CARRILES.length;
        const instanced = new THREE.InstancedMesh(geo, mat, total);

        const dummy = new THREE.Object3D();
        let idx = 0;
        const step = 5;

        CARRILES_X.forEach(xCarril => {
            for (let i = 0; i < cantidadPorCarril; i++) {
                const z = 15 - i * step;
                const x = xCarril + curva(z);
                dummy.position.set(x, 0.04, z);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            }
        });
        escena.add(instanced);
    }

    // ---------- Postes laterales ----------
    function construirPostes(mapaConfig) {
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.6,
            metalness: 0.3
        });
        const geo = new THREE.BoxGeometry(0.18, 2.0, 0.18);
        const cantidad = 90;
        const instanced = new THREE.InstancedMesh(geo, mat, cantidad * 2);
        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let i = 0; i < cantidad; i++) {
            const z = 15 - i * 7;
            const c = curva(z);
            [-5.5, 5.5].forEach(x => {
                dummy.position.set(x + c, 1.0, z);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            });
        }
        escena.add(instanced);
    }

    // ---------- Decoración por mapa ----------
    function construirDecoracion(mapaConfig) {
        decoracionesAnimadas = [];
        const tipo = mapaConfig.decoracion;
        const color = mapaConfig.decoColor;

        if (tipo === 'sol') {
            // Sol gigante al fondo
            const solGeo = new THREE.CircleGeometry(28, 48);
            const solMat = new THREE.MeshBasicMaterial({
                color: 0xffe0c4,
                transparent: true,
                opacity: 0.9
            });
            const sol = new THREE.Mesh(solGeo, solMat);
            sol.position.set(0, 18, -240);
            escena.add(sol);

            const haloGeo = new THREE.CircleGeometry(42, 48);
            const haloMat = new THREE.MeshBasicMaterial({
                color: 0xffb890,
                transparent: true,
                opacity: 0.35
            });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            halo.position.set(0, 18, -242);
            escena.add(halo);
        }

        else if (tipo === 'cristales') {
            // Cristales flotantes a los costados
            const geo = new THREE.OctahedronGeometry(1.2, 0);
            const mat = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.65,
                metalness: 0.3,
                roughness: 0.3,
                transparent: true,
                opacity: 0.9
            });
            const cantidad = 24;
            const instanced = new THREE.InstancedMesh(geo, mat, cantidad);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < cantidad; i++) {
                const z = 10 - i * 20;
                const lado = i % 2 === 0 ? -1 : 1;
                const x = lado * (6 + Math.random() * 4) + curva(z);
                const y = 2 + Math.random() * 3.5;
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
            escena.add(instanced);
            decoracionesAnimadas.push({ tipo: 'cristales', mesh: instanced });
        }

        else if (tipo === 'reflectores') {
            // Conos de luz desde arriba
            const cantidad = 6;
            for (let i = 0; i < cantidad; i++) {
                const z = 0 - i * 60;
                const lado = i % 2 === 0 ? -1 : 1;
                const conoGeo = new THREE.ConeGeometry(2.5, 14, 16, 1, true);
                const conoMat = new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.18,
                    side: THREE.DoubleSide
                });
                const cono = new THREE.Mesh(conoGeo, conoMat);
                cono.position.set(lado * 7 + curva(z), 8, z);
                cono.rotation.x = Math.PI;
                escena.add(cono);
                decoracionesAnimadas.push({
                    tipo: 'reflector',
                    mesh: cono,
                    fase: i * 0.7
                });
            }
        }

        else if (tipo === 'engranajes') {
            // Engranajes girando a los costados
            const cantidad = 12;
            for (let i = 0; i < cantidad; i++) {
                const z = 5 - i * 45;
                const lado = i % 2 === 0 ? -1 : 1;
                const r = 1.5 + Math.random() * 1.5;
                const geo = new THREE.TorusGeometry(r, r * 0.18, 8, 16);
                const mat = new THREE.MeshStandardMaterial({
                    color,
                    metalness: 0.7,
                    roughness: 0.4,
                    emissive: color,
                    emissiveIntensity: 0.15
                });
                const g = new THREE.Mesh(geo, mat);
                g.position.set(lado * 7 + curva(z), 4 + Math.random() * 3, z);
                g.rotation.y = Math.random() * Math.PI;
                escena.add(g);
                decoracionesAnimadas.push({
                    tipo: 'engranaje',
                    mesh: g,
                    vel: (i % 2 === 0 ? 1 : -1) * (0.4 + Math.random() * 0.4)
                });
            }
        }
    }

    // ---------- Carrito (más chico y low-poly) ----------
    function crearCarrito(color, jugadorInfo, esRival) {
        const group = new THREE.Group();

        // Cuerpo: 1.4 × 0.8 × 2.2
        const cuerpoGeo = new THREE.BoxGeometry(1.4, 0.8, 2.2);
        const cuerpoMat = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.5,
            roughness: 0.5
        });
        const cuerpo = new THREE.Mesh(cuerpoGeo, cuerpoMat);
        cuerpo.position.y = 0.65;
        group.add(cuerpo);

        // Borde superior
        const bordeGeo = new THREE.BoxGeometry(1.5, 0.12, 2.35);
        const bordeMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
        const borde = new THREE.Mesh(bordeGeo, bordeMat);
        borde.position.y = 1.1;
        group.add(borde);

        // Frente brillante
        const frenteGeo = new THREE.BoxGeometry(1.2, 0.5, 0.08);
        const frenteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.4,
            roughness: 0.3,
            emissive: 0xffffff,
            emissiveIntensity: 0.15
        });
        const frente = new THREE.Mesh(frenteGeo, frenteMat);
        frente.position.set(0, 0.65, -1.11);
        group.add(frente);

        // Ruedas
        const ruedaGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
        const ruedaMat = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.85
        });
        [
            [-0.75, 0.3, -0.75],
            [ 0.75, 0.3, -0.75],
            [-0.75, 0.3,  0.75],
            [ 0.75, 0.3,  0.75]
        ].forEach(p => {
            const r = new THREE.Mesh(ruedaGeo, ruedaMat);
            r.rotation.z = Math.PI / 2;
            r.position.set(...p);
            group.add(r);
        });

        // Foto / inicial / signo "?"
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');

        if (esRival) {
            c.fillStyle = '#' + color.toString(16).padStart(6, '0');
            c.beginPath();
            c.arc(64, 64, 58, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 84px Nunito, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('?', 64, 72);
        } else if (jugadorInfo && jugadorInfo.foto) {
            // Foto real (se carga async y se redibuja)
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

            // Base mientras carga
            c.fillStyle = '#' + color.toString(16).padStart(6, '0');
            c.beginPath();
            c.arc(64, 64, 58, 0, Math.PI * 2);
            c.fill();
        } else {
            // Inicial
            c.fillStyle = '#' + color.toString(16).padStart(6, '0');
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

        const planeGeo = new THREE.PlaneGeometry(0.75, 0.75);
        const planeMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.set(0, 1.55, 0);
        group.add(plane);

        return group;
    }

    // ---------- Obstáculos ----------
    function obtenerObstaculoDelPool() {
        let o = poolObstaculos.pop();
        if (!o) {
            const geo = new THREE.BoxGeometry(1.1, 0.9, 1.1);
            const mat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculo,
                roughness: 0.7,
                metalness: 0.2
            });
            o = new THREE.Mesh(geo, mat);

            const bordeGeo = new THREE.BoxGeometry(1.2, 0.12, 1.2);
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
    function updateEscena(jugadorData, rivalesData, obstaculosData, dt) {
        if (!escena) return;

        // Jugador en Z = 0
        if (carritoJugador) {
            const xBase = CARRILES_X[jugadorData.carril];
            const xFinal = xBase + curva(0);
            // Interpolación suave desde la X actual
            carritoJugador.position.x += (xFinal - carritoJugador.position.x) * Math.min(dt * 14, 1);
            carritoJugador.position.z = 0;
        }

        // Rivales
        carritosRivales.forEach((c, i) => {
            const r = rivalesData[i];
            if (!r) return;
            const zRel = -(r.progreso - jugadorData.progreso);
            const xBase = CARRILES_X[r.carril];
            const xFinal = xBase + curva(zRel);
            c.position.x += (xFinal - c.position.x) * Math.min(dt * 14, 1);
            c.position.z = zRel;
        });

        // Cámara: sigue la curva al 30%
        const curvaCam = curva(-2) * 0.3;
        camara.position.x += (curvaCam - camara.position.x) * Math.min(dt * 4, 1);
        camara.lookAt(
            camara.position.x * 0.5,
            1.5,
            -8
        );

        // Obstáculos
        const idsVivos = new Set(obstaculosData.map(o => o.id));
        grupoMundo.children.slice().forEach(child => {
            if (!idsVivos.has(child.userData.id)) {
                devolverAlPool(child);
            }
        });

        obstaculosData.forEach(o => {
            let mesh = grupoMundo.children.find(c => c.userData.id === o.id);
            if (!mesh) {
                mesh = obtenerObstaculoDelPool();
                mesh.userData.id = o.id;
                grupoMundo.add(mesh);
            }
            const xBase = CARRILES_X[o.carril];
            mesh.position.set(xBase + curva(o.z), 0.45, o.z);
        });

        // Decoraciones animadas
        const t = performance.now() / 1000;
        decoracionesAnimadas.forEach(d => {
            if (d.tipo === 'engranaje') {
                d.mesh.rotation.z += d.vel * dt;
            } else if (d.tipo === 'reflector') {
                d.mesh.rotation.y = Math.sin(t * 0.6 + d.fase) * 0.4;
            } else if (d.tipo === 'cristales') {
                // Rotación global lenta
                d.mesh.rotation.y = t * 0.15;
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
        carritoJugador = null;
        carritosRivales = [];
        grupoMundo = null;
        poolObstaculos = [];
        decoracionesAnimadas = [];
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
        curva,
        init,
        updateEscena,
        limpiarEscena,
        render,
        onResize
    };
})();
