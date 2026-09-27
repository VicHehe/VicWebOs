// ============================================================
//  Vagonetas — Capa visual (Three.js)
//  ------------------------------------------------------------
//  No sabe nada de game logic. Solo construye y renderiza.
//  Exporta window.VG_Escena con:
//    init(contenedor, mapaConfig, jugadorConfig)
//    updateEscena(jugadorX, jugadorProgreso, rivales, obstaculos, dt)
//    limpiarEscena()
//    render()
//    onResize()
// ============================================================

(function () {
    'use strict';

    const CARRILES = [-2, 0, 2];  // 3 carriles, ancho 2 unidades

    let escena = null;
    let camara = null;
    let renderer = null;
    let contenedorActual = null;
    let mapaActual = null;

    let carritoJugador = null;
    let carritosRivales = [];
    let grupoMundo = null;   // obstáculos vivos
    let poolObstaculos = [];

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

        camara = new THREE.PerspectiveCamera(60, w / h, 0.1, 500);
        camara.position.set(0, 6.5, 11);
        camara.lookAt(0, 1.8, -6);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        contenedor.appendChild(renderer.domElement);

        // Luces
        const amb = new THREE.AmbientLight(
            mapaConfig.luzAmb.color,
            mapaConfig.luzAmb.intensidad
        );
        escena.add(amb);

        const dir = new THREE.DirectionalLight(
            mapaConfig.luzDir.color,
            mapaConfig.luzDir.intensidad
        );
        dir.position.set(...mapaConfig.luzDir.pos);
        escena.add(dir);

        // Suelo
        const sueloGeo = new THREE.PlaneGeometry(60, 600);
        const sueloMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.suelo,
            roughness: 0.95,
            metalness: 0.05
        });
        const suelo = new THREE.Mesh(sueloGeo, sueloMat);
        suelo.rotation.x = -Math.PI / 2;
        suelo.position.set(0, 0, -200);
        escena.add(suelo);

        // Rieles (3 carriles × 2 rieles)
        construirRieles(mapaConfig);

        // Durmientes (InstancedMesh)
        construirDurmientes(mapaConfig);

        // Postes laterales (dan sensación de velocidad)
        construirPostes(mapaConfig);

        // Grupo para obstáculos
        grupoMundo = new THREE.Group();
        escena.add(grupoMundo);

        // Carrito del jugador (con su foto)
        carritoJugador = crearCarrito(mapaConfig.jugador, jugadorInfo);
        carritoJugador.position.set(0, 0, 0);
        escena.add(carritoJugador);

        // Rivales (sin foto, color sólido)
        carritosRivales = [];
        for (let i = 0; i < 2; i++) {
            const color = i === 0 ? mapaConfig.rival1 : mapaConfig.rival2;
            const c = crearCarrito(color, null);
            c.position.set(CARRILES[i === 0 ? 0 : 2], 0, 0);
            escena.add(c);
            carritosRivales.push(c);
        }

        render();
    }

    // ---------- Rieles ----------
    function construirRieles(mapaConfig) {
        const rielMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.riel,
            metalness: 0.7,
            roughness: 0.35
        });
        const largo = 600;
        const rielGeo = new THREE.BoxGeometry(0.12, 0.08, largo);

        CARRILES.forEach(x => {
            const r1 = new THREE.Mesh(rielGeo, rielMat);
            r1.position.set(x - 0.7, 0.08, -200);
            escena.add(r1);
            const r2 = new THREE.Mesh(rielGeo, rielMat);
            r2.position.set(x + 0.7, 0.08, -200);
            escena.add(r2);
        });
    }

    // ---------- Durmientes ----------
    function construirDurmientes(mapaConfig) {
        const cantidadPorCarril = 200;
        const total = cantidadPorCarril * CARRILES.length;
        const geo = new THREE.BoxGeometry(1.8, 0.06, 0.3);
        const mat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.9
        });
        const instanced = new THREE.InstancedMesh(geo, mat, total);
        const dummy = new THREE.Object3D();
        let idx = 0;
        CARRILES.forEach(x => {
            for (let i = 0; i < cantidadPorCarril; i++) {
                dummy.position.set(x, 0.04, 15 - i * 3);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            }
        });
        escena.add(instanced);
    }

    // ---------- Postes laterales ----------
    function construirPostes(mapaConfig) {
        const posteMat = new THREE.MeshStandardMaterial({
            color: mapaConfig.rielMetal,
            roughness: 0.6,
            metalness: 0.3
        });
        const geo = new THREE.BoxGeometry(0.15, 1.6, 0.15);
        const cantidad = 120;
        const instanced = new THREE.InstancedMesh(geo, posteMat, cantidad * 2);
        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let i = 0; i < cantidad; i++) {
            const z = 15 - i * 5;
            [-4, 4].forEach(x => {
                dummy.position.set(x, 0.8, z);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            });
        }
        escena.add(instanced);
    }

    // ---------- Carrito ----------
    function crearCarrito(color, jugadorInfo) {
        const group = new THREE.Group();

        // Cuerpo principal
        const cuerpoGeo = new THREE.BoxGeometry(1.6, 1.2, 3);
        const cuerpoMat = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.4,
            roughness: 0.55
        });
        const cuerpo = new THREE.Mesh(cuerpoGeo, cuerpoMat);
        cuerpo.position.y = 1.0;
        group.add(cuerpo);

        // Borde superior (detalle)
        const bordeGeo = new THREE.BoxGeometry(1.75, 0.15, 3.15);
        const bordeMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
        const borde = new THREE.Mesh(bordeGeo, bordeMat);
        borde.position.y = 1.68;
        group.add(borde);

        // Frente (más brillante)
        const frenteGeo = new THREE.BoxGeometry(1.5, 0.7, 0.1);
        const frenteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.3,
            roughness: 0.4
        });
        const frente = new THREE.Mesh(frenteGeo, frenteMat);
        frente.position.set(0, 1.0, -1.5);
        group.add(frente);

        // Ruedas
        const ruedaGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12);
        const ruedaMat = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.8
        });
        const ruedasPos = [
            [-0.9, 0.4, -1.0],
            [ 0.9, 0.4, -1.0],
            [-0.9, 0.4,  1.0],
            [ 0.9, 0.4,  1.0]
        ];
        ruedasPos.forEach(p => {
            const r = new THREE.Mesh(ruedaGeo, ruedaMat);
            r.rotation.z = Math.PI / 2;
            r.position.set(...p);
            group.add(r);
        });

        // Foto del jugador (billboard arriba)
        if (jugadorInfo && jugadorInfo.foto) {
            const tex = new THREE.TextureLoader().load(
                jugadorInfo.foto,
                () => { render(); },
                undefined,
                () => { /* error: nada */ }
            );
            tex.minFilter = THREE.LinearFilter;
            const planeGeo = new THREE.PlaneGeometry(0.9, 0.9);
            const planeMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true
            });
            const plane = new THREE.Mesh(planeGeo, planeMat);
            plane.position.set(0, 2.35, 0);
            group.add(plane);
        } else if (jugadorInfo && jugadorInfo.inicial) {
            // Textura con la inicial
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const c = canvas.getContext('2d');
            c.fillStyle = '#8B5CF6';
            c.fillRect(0, 0, 128, 128);
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 80px Nunito, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(jugadorInfo.inicial, 64, 70);

            const tex = new THREE.CanvasTexture(canvas);
            const planeGeo = new THREE.PlaneGeometry(0.9, 0.9);
            const planeMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true
            });
            const plane = new THREE.Mesh(planeGeo, planeMat);
            plane.position.set(0, 2.35, 0);
            group.add(plane);
        }

        // Etiqueta flotante para rivales (número)
        if (!jugadorInfo) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const c = canvas.getContext('2d');
            c.fillStyle = '#' + color.toString(16).padStart(6, '0');
            c.beginPath();
            c.arc(64, 64, 56, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#FFFFFF';
            c.font = 'bold 72px Nunito, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('?', 64, 70);

            const tex = new THREE.CanvasTexture(canvas);
            const planeGeo = new THREE.PlaneGeometry(0.75, 0.75);
            const planeMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true
            });
            const plane = new THREE.Mesh(planeGeo, planeMat);
            plane.position.set(0, 2.35, 0);
            group.add(plane);
        }

        return group;
    }

    // ---------- Obstáculos ----------
    function obtenerObstaculoDelPool() {
        let o = poolObstaculos.pop();
        if (!o) {
            const geo = new THREE.BoxGeometry(1.3, 1.1, 1.3);
            const mat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculo,
                roughness: 0.7,
                metalness: 0.2
            });
            o = new THREE.Mesh(geo, mat);

            // Detalle: borde superior
            const bordeGeo = new THREE.BoxGeometry(1.4, 0.15, 1.4);
            const bordeMat = new THREE.MeshStandardMaterial({
                color: mapaActual.obstaculoB
            });
            const borde = new THREE.Mesh(bordeGeo, bordeMat);
            borde.position.y = 0.6;
            o.add(borde);
        }
        return o;
    }

    function devolverAlPool(mesh) {
        if (mesh.parent) mesh.parent.remove(mesh);
        poolObstaculos.push(mesh);
    }

    // ---------- Update ----------
    function updateEscena(jugadorX, jugadorProgreso, rivales, obstaculos, dt) {
        if (!escena) return;

        // Jugador
        if (carritoJugador) {
            carritoJugador.position.x = jugadorX;
        }

        // Rivales: z = -(rival.progreso - jugador.progreso)
        carritosRivales.forEach((c, i) => {
            const r = rivales[i];
            if (!r) return;
            c.position.x = CARRILES[r.carril];
            c.position.z = -(r.progreso - jugadorProgreso);
        });

        // Obstáculos: sync con el estado del juego
        // Reconstruimos la lista visual según los obstáculos activos
        const activos = grupoMundo.children.slice();
        const idsVivos = new Set(obstaculos.map(o => o.id));

        // Quitar los que ya no existen
        activos.forEach(child => {
            if (!idsVivos.has(child.userData.id)) {
                devolverAlPool(child);
            }
        });

        // Añadir / actualizar los que existen
        obstaculos.forEach(o => {
            let mesh = grupoMundo.children.find(c => c.userData.id === o.id);
            if (!mesh) {
                mesh = obtenerObstaculoDelPool();
                mesh.userData.id = o.id;
                grupoMundo.add(mesh);
            }
            mesh.position.set(CARRILES[o.carril], 0.55, o.z);
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
        CARRILES,
        init,
        updateEscena,
        limpiarEscena,
        render,
        onResize
    };
})();
