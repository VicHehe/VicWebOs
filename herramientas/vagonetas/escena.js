// ============================================================
//  Vagonetas — Escena en Z-MUNDO
//  ------------------------------------------------------------
//  · El track vive en world Z (-20 a -1100), construido UNA vez.
//  · El jugador avanza por Z negativo (player.z = -progreso).
//  · La cámara va 11 unidades atrás del jugador, altura fija.
//  · Las curvas se aplican con curvaEnMundo(zMundo) → offset X.
//  · Nada de mundoGroup moviéndose. Nada de lerp raro.
// ============================================================

(function () {
    'use strict';

    const CARRILES_X = [-4, -2, 0, 2, 4];
    const CANT_CARRILES = 5;
    const Z_INI = 30;
    const Z_FIN = -1100;

    // ---- Curva plan (inmutable, generado 1 vez por partida) ----
    let trackSegs = [];

    function generarTrack() {
        trackSegs = [];
        let z = Z_INI;
        let x = 0;
        while (z > Z_FIN) {
            // Recto 70-100m
            const largRecto = 70 + Math.random() * 30;
            trackSegs.push({ z1: z, z2: z - largRecto, x1: x, x2: x });
            z -= largRecto;

            // 65% de las veces: curva de 45-60m, desplaza ±5 a ±9
            if (Math.random() < 0.65) {
                const signo = Math.random() < 0.5 ? -1 : 1;
                const dx = signo * (5 + Math.random() * 4);
                const largCurva = 45 + Math.random() * 15;
                trackSegs.push({ z1: z, z2: z - largCurva, x1: x, x2: x + dx });
                z -= largCurva;
                x += dx;
            }
        }
    }

    function curvaEnMundo(z) {
        if (trackSegs.length === 0) return 0;
        for (let i = 0; i < trackSegs.length; i++) {
            const s = trackSegs[i];
            if (z <= s.z1 && z >= s.z2) {
                const t = (s.z1 - z) / (s.z1 - s.z2);
                const ts = t * t * (3 - 2 * t);
                return s.x1 + (s.x2 - s.x1) * ts;
            }
        }
        // Fuera de rango
        if (z < trackSegs[trackSegs.length - 1].z2) {
            return trackSegs[trackSegs.length - 1].x2;
        }
        return 0;
    }

    // ---- Refs ----
    let escena = null, camara = null, renderer = null;
    let contenedorActual = null;
    let mapaActual = null;

    let carritoJugador = null;
    let carritosRivales = [];
    let grupoObstaculos = null;
    let poolObstaculos = [];
    let decoracionesAnimadas = [];

    let camaraXActual = 0;

    // ---- Init ----
    function init(contenedor, mapaConfig, jugadorInfo) {
        limpiarEscena();
        contenedorActual = contenedor;
        mapaActual = mapaConfig;

        generarTrack();

        escena = new THREE.Scene();
        escena.background = new THREE.Color(mapaConfig.cielo);
        escena.fog = new THREE.Fog(
            mapaConfig.niebla.color,
            mapaConfig.niebla.near,
            mapaConfig.niebla.far
        );

        const w = contenedor.clientWidth || 400;
        const h = contenedor.clientHeight || 600;

        camara = new THREE.PerspectiveCamera(64, w / h, 0.1, 400);

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

        // Suelo estático (cubre toda la pista)
        const largoTotal = Z_INI - Z_FIN + 100;
        const sueloGeo = new THREE.PlaneGeometry(180, largoTotal);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.suelo,
            roughness: 0.95,
            metalness: 0.05
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, (Z_INI + Z_FIN) / 2);
        escena.add(suelo);

        // Construcciones estáticas (en world Z, nunca se mueven)
        construirRieles(mapaConfig);
        construirDurmientes(mapaConfig);
        construirPostes(mapaConfig);
        construirDecoracion(mapaConfig);

        // Grupo obstáculos (se reciclan)
        grupoObstaculos = new THREE.Group();
        escena.add(grupoObstaculos);

        // Carrito del jugador
        carritoJugador = crearCarrito(mapaConfig.jugador, jugadorInfo, false);
        escena.add(carritoJugador);

        // Rivales
        carritosRivales = [];
        for (let i = 0; i < 2; i++) {
            const color = i === 0 ? mapaConfig.rival1 : mapaConfig.rival2;
            const c = crearCarrito(color, null, true);
            escena.add(c);
            carritosRivales.push(c);
        }

        camaraXActual = 0;
        render();
    }

    // ---- Rieles (curvos, en world Z, estáticos) ----
    function construirRieles(mapaConfig) {
        const rielMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.riel,
            metalness: 0.75,
            roughness: 0.3,
            emissive: mapaConfig.riel,
            emissiveIntensity: 0.55
        });

        // Segmentos: cada 4 unidades de Z
        const step = 4;
        const SEG = Math.floor((Z_INI - Z_FIN) / step);
        const offsetLateral = 0.55;
        const anchoRiel = 0.18;
        const altoRiel = 0.14;

        const cantidad = SEG * 2 * CANT_CARRILES;
        const geo = new THREE.BoxGeometry(anchoRiel, altoRiel, step * 1.1);
        const instanced = new THREE.InstancedMesh(geo, rielMat, cantidad);
        const dummy = new THREE.Object3D();
        let idx = 0;

        CARRILES_X.forEach(xC => {
            [-offsetLateral, offsetLateral].forEach(off => {
                for (let i = 0; i < SEG; i++) {
                    const z1 = Z_INI - i * step;
                    const z2 = z1 - step;
                    const x1 = xC + off + curvaEnMundo(z1);
                    const x2 = xC + off + curvaEnMundo(z2);
                    const xm = (x1 + x2) / 2;
                    const zm = (z1 + z2) / 2;
                    const dx = x2 - x1;
                    const dz = z2 - z1;
                    dummy.position.set(xm, 0.1, zm);
                    dummy.rotation.set(0, Math.atan2(dx, -dz), 0);
                    dummy.updateMatrix();
                    instanced.setMatrixAt(idx++, dummy.matrix);
                }
            });
        });

        escena.add(instanced);
    }

    // ---- Durmientes ----
    function construirDurmientes(mapaConfig) {
        const geo = new THREE.BoxGeometry(2.2, 0.1, 0.35);
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.85,
            emissive: mapaConfig.rielMetal,
            emissiveIntensity: 0.15
        });

        const step = 3.5;
        const cantidad = Math.floor((Z_INI - Z_FIN) / step);
        const instanced = new THREE.InstancedMesh(geo, mat, cantidad * CANT_CARRILES);
        const dummy = new THREE.Object3D();
        let idx = 0;

        CARRILES_X.forEach(xC => {
            for (let i = 0; i < cantidad; i++) {
                const z = Z_INI - i * step;
                const x = xC + curvaEnMundo(z);
                dummy.position.set(x, 0.05, z);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            }
        });

        escena.add(instanced);
    }

    // ---- Postes laterales ----
    function construirPostes(mapaConfig) {
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.6,
            metalness: 0.4,
            emissive: mapaConfig.rielMetal,
            emissiveIntensity: 0.3
        });
        const geo = new THREE.BoxGeometry(0.22, 2.5, 0.22);
        const step = 9;
        const cantidad = Math.floor((Z_INI - Z_FIN) / step);
        const instanced = new THREE.InstancedMesh(geo, mat, cantidad * 2);
        const dummy = new THREE.Object3D();
        let idx = 0;

        for (let i = 0; i < cantidad; i++) {
            const z = Z_INI - i * step;
            const c = curvaEnMundo(z);
            [-6.3, 6.3].forEach(x => {
                dummy.position.set(x + c, 1.25, z);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            });
        }

        escena.add(instanced);
    }

    // ---- Decoración por mapa ----
    function construirDecoracion(mapaConfig) {
        decoracionesAnimadas = [];
        const tipo = mapaConfig.decoracion;
        const color = mapaConfig.decoColor;
        const largoTotal = Z_INI - Z_FIN;

        if (tipo === 'sol') {
            const solGeo = new THREE.CircleGeometry(38, 48);
            const solMat = new THREE.MeshBasicMaterial({
                color: 0xffe0c4, transparent: true, opacity: 0.9
            });
            const sol = new THREE.Mesh(solGeo, solMat);
            sol.position.set(0, 28, -450);
            escena.add(sol);

            const haloGeo = new THREE.CircleGeometry(55, 48);
            const haloMat = new THREE.MeshBasicMaterial({
                color: 0xffb890, transparent: true, opacity: 0.28
            });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            halo.position.set(0, 28, -452);
            escena.add(halo);
        }

        else if (tipo === 'cristales') {
            const geo = new THREE.OctahedronGeometry(1.6, 0);
            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 0.9,
                metalness: 0.35, roughness: 0.25,
                transparent: true, opacity: 0.92
            });
            const cantidad = 80;
            const instanced = new THREE.InstancedMesh(geo, mat, cantidad);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < cantidad; i++) {
                const z = Z_INI - (i / cantidad) * largoTotal;
                const lado = i % 2 === 0 ? -1 : 1;
                const x = lado * (9 + Math.random() * 5) + curvaEnMundo(z);
                const y = 3 + Math.random() * 4;
                dummy.position.set(x, y, z);
                dummy.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                dummy.scale.setScalar(0.7 + Math.random() * 0.8);
                dummy.updateMatrix();
                instanced.setMatrixAt(i, dummy.matrix);
            }
            escena.add(instanced);
            decoracionesAnimadas.push({ tipo: 'cristales', mesh: instanced });
        }

        else if (tipo === 'reflectores') {
            const cantidad = 40;
            for (let i = 0; i < cantidad; i++) {
                const z = Z_INI - (i / cantidad) * largoTotal;
                const lado = i % 2 === 0 ? -1 : 1;
                const conoGeo = new THREE.ConeGeometry(3.2, 22, 16, 1, true);
                const conoMat = new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.16,
                    side: THREE.DoubleSide
                });
                const cono = new THREE.Mesh(conoGeo, conoMat);
                cono.position.set(lado * 9 + curvaEnMundo(z), 12, z);
                cono.rotation.x = Math.PI;
                escena.add(cono);
                decoracionesAnimadas.push({
                    tipo: 'reflector', mesh: cono, fase: i * 0.6
                });
            }
        }

        else if (tipo === 'engranajes') {
            const cantidad = 50;
            for (let i = 0; i < cantidad; i++) {
                const z = Z_INI - (i / cantidad) * largoTotal;
                const lado = i % 2 === 0 ? -1 : 1;
                const r = 1.8 + Math.random() * 1.6;
                const geo = new THREE.TorusGeometry(r, r * 0.22, 8, 18);
                const mat = new THREE.MeshStandardMaterial({
                    color, metalness: 0.8, roughness: 0.32,
                    emissive: color, emissiveIntensity: 0.22
                });
                const g = new THREE.Mesh(geo, mat);
                g.position.set(lado * 9 + curvaEnMundo(z), 5 + Math.random() * 3, z);
                g.rotation.y = Math.random() * Math.PI;
                escena.add(g);
                decoracionesAnimadas.push({
                    tipo: 'engranaje', mesh: g,
                    vel: (i % 2 === 0 ? 1 : -1) * (0.5 + Math.random() * 0.5)
                });
            }
        }
    }

    // ---- Carrito ----
    function crearCarrito(color, jugadorInfo, esRival) {
        const group = new THREE.Group();

        const cuerpoGeo = new THREE.BoxGeometry(1.35, 0.75, 2.1);
        const cuerpoMat = new THREE.MeshStandardMaterial({
            color, metalness: 0.55, roughness: 0.42,
            emissive: color, emissiveIntensity: 0.2
        });
        const cuerpo = new THREE.Mesh(cuerpoGeo, cuerpoMat);
        cuerpo.position.y = 0.6;
        group.add(cuerpo);

        const bordeGeo = new THREE.BoxGeometry(1.45, 0.1, 2.25);
        const bordeMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
        const borde = new THREE.Mesh(bordeGeo, bordeMat);
        borde.position.y = 1.0;
        group.add(borde);

        // Frente brillante
        const frenteGeo = new THREE.BoxGeometry(1.15, 0.42, 0.06);
        const frenteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, metalness: 0.3, roughness: 0.3,
            emissive: 0xffffff, emissiveIntensity: 0.4
        });
        const frente = new THREE.Mesh(frenteGeo, frenteMat);
        frente.position.set(0, 0.6, -1.06);
        group.add(frente);

        // Ruedas
        const ruedaGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
        const ruedaMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
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

        // Disco superior (foto / inicial / ?)
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const c = canvas.getContext('2d');
        const colorHex = '#' + color.toString(16).padStart(6, '0');

        if (esRival) {
            c.fillStyle = colorHex;
            c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 84px Nunito, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('?', 64, 72);
        } else if (jugadorInfo && jugadorInfo.foto) {
            c.fillStyle = colorHex;
            c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                c.clearRect(0, 0, 128, 128);
                c.save();
                c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.clip();
                c.drawImage(img, 0, 0, 128, 128);
                c.restore();
                c.strokeStyle = '#FFFFFF';
                c.lineWidth = 6;
                c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.stroke();
                tex.needsUpdate = true;
            };
            img.src = jugadorInfo.foto;
        } else {
            c.fillStyle = colorHex;
            c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 80px Nunito, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            const ini = (jugadorInfo && jugadorInfo.inicial) ? jugadorInfo.inicial : '?';
            c.fillText(ini, 64, 70);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;

        const planeGeo = new THREE.PlaneGeometry(0.8, 0.8);
        const planeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.set(0, 1.5, 0);
        group.add(plane);

        return group;
    }

    // ---- Obstáculos ----
    function obtenerObstaculoDelPool() {
        let o = poolObstaculos.pop();
        if (!o) {
            const geo = new THREE.BoxGeometry(1.15, 0.95, 1.15);
            const mat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculo,
                roughness: 0.7, metalness: 0.25,
                emissive: mapaActual.obstaculo,
                emissiveIntensity: 0.35
            });
            o = new THREE.Mesh(geo, mat);
            const bordeGeo = new THREE.BoxGeometry(1.25, 0.14, 1.25);
            const bordeMat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculoB,
                emissive: mapaActual.obstaculoB,
                emissiveIntensity: 0.3
            });
            const borde = new THREE.Mesh(bordeGeo, bordeMat);
            borde.position.y = 0.55;
            o.add(borde);
        }
        return o;
    }

    function devolverAlPool(mesh) {
        if (mesh.parent) mesh.parent.remove(mesh);
        poolObstaculos.push(mesh);
    }

    // ---- Update ----
    function updateEscena(jugadorData, rivalesData, obstaculosData, dt, shakeMs) {
        if (!escena) return;

        const progreso = jugadorData.progreso;

        // Jugador: Z = -progreso, X = carril + curva
        if (carritoJugador) {
            const zJ = -progreso;
            const xJ = CARRILES_X[jugadorData.carril] + curvaEnMundo(zJ);
            carritoJugador.position.z = zJ;
            carritoJugador.position.x += (xJ - carritoJugador.position.x) * Math.min(dt * 15, 1);
        }

        // Rivales
        carritosRivales.forEach((c, i) => {
            const r = rivalesData[i];
            if (!r) return;
            const zR = -r.progreso;
            const xR = CARRILES_X[r.carril] + curvaEnMundo(zR);
            c.position.z = zR;
            c.position.x += (xR - c.position.x) * Math.min(dt * 15, 1);
        });

        // Obstáculos: viven en world Z
        const idsVivos = new Set(obstaculosData.map(o => o.id));
        grupoObstaculos.children.slice().forEach(child => {
            if (!idsVivos.has(child.userData.id)) devolverAlPool(child);
        });

        obstaculosData.forEach(o => {
            let mesh = grupoObstaculos.children.find(c => c.userData.id === o.id);
            if (!mesh) {
                mesh = obtenerObstaculoDelPool();
                mesh.userData.id = o.id;
                grupoObstaculos.add(mesh);
            }
            // o.z es relativo al jugador. Z mundo = -progreso + o.z
            const zW = -progreso + o.z;
            const xW = CARRILES_X[o.carril] + curvaEnMundo(zW);
            mesh.position.set(xW, 0.5, zW);
        });

        // Cámara: sigue al jugador, mira adelante, X sigue al jugador al 40%
        const camTargetX = carritoJugador ? carritoJugador.position.x * 0.4 : 0;
        camaraXActual += (camTargetX - camaraXActual) * Math.min(dt * 5, 1);

        let sX = 0, sY = 0;
        if (shakeMs > 0) {
            const inten = Math.min(shakeMs / 400, 1) * 0.4;
            sX = (Math.random() - 0.5) * inten;
            sY = (Math.random() - 0.5) * inten;
        }

        const camZ = -progreso + 11;
        camara.position.set(camaraXActual + sX, 6.8 + sY, camZ);
        camara.lookAt(
            camaraXActual * 0.7,
            1.6,
            -progreso - 14
        );

        // Decoraciones animadas
        const t = performance.now() / 1000;
        decoracionesAnimadas.forEach(d => {
            if (d.tipo === 'engranaje') d.mesh.rotation.z += d.vel * dt;
            else if (d.tipo === 'reflector') d.mesh.rotation.y = Math.sin(t * 0.7 + d.fase) * 0.5;
            else if (d.tipo === 'cristales') d.mesh.rotation.y = t * 0.2;
        });

        render();
    }

    function render() {
        if (!renderer || !escena || !camara) return;
        renderer.render(escena, camara);
    }

    function limpiarEscena() {
        if (renderer && contenedorActual) {
            try { contenedorActual.removeChild(renderer.domElement); } catch (e) {}
            renderer.dispose();
            renderer = null;
        }
        escena = null; camara = null;
        carritoJugador = null;
        carritosRivales = [];
        grupoObstaculos = null;
        poolObstaculos = [];
        decoracionesAnimadas = [];
        trackSegs = [];
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
        curvaEnMundo,
        init,
        updateEscena,
        limpiarEscena,
        render,
        onResize
    };
})();
