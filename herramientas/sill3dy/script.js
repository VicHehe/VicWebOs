// ============================================================
//  Sill3Dy — Escultor de voxels en 3D
//  ------------------------------------------------------------
//  Mini editor 3D estilo MagicaVoxel / Goxel.
//
//  · Modelo: Uint32Array de tamaño N³ (N = 16 a 64)
//    0 = celda vacía · cualquier otro valor = RGBA empaquetado.
//  · Render: Three.js — geometría generada a mano con SOLO
//    las caras visibles (voxel meshing clásico).
//  · Raycast: DDA (Amanatides & Woo) — caminar por la grilla
//    en vez de intersectar miles de triángulos.
//  · Persistencia: IndexedDB (1 proyecto por usuario).
//  · Export: OBJ con colores, PNG del viewport, Galería.
//  · Tema heredado del shell (var(--...)).
//
//  VERSION 1.1 — fixes:
//    · Ejes anclados a la esquina del grid (antes flotaban).
//    · Cámara inicial más lejos y mirando al workspace.
//    · Zoom de rueda más rápido (25% por paso).
//    · Pan: click medio + Shift+click derecho.
//    · Sensibilidad de pan mejorada.
//    · Modal de controles la primera vez.
// ============================================================

'use strict';

// ============================================================
//  CONSTANTES
// ============================================================
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsSill3Dy';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';
const DEFAULT_SIZE = 32;
const MAX_UNDO = 30;
const HINT_KEY = 's3d_hint_visto';

// Paleta PICO-8 (coherente con PixEvan)
const PALETA_DEFAULT = [
    '#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8',
    '#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'
];

// Caras del cubo: normal + 4 vértices (offset local 0..1) en CCW externo
const FACES = [
    { n: [ 1, 0, 0], v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { n: [-1, 0, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
    { n: [ 0, 1, 0], v: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { n: [ 0,-1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { n: [ 0, 0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { n: [ 0, 0,-1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
];

// ============================================================
//  API del shell
// ============================================================
const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  ESTADO GLOBAL
// ============================================================
const state = {
    size: DEFAULT_SIZE,
    voxels: new Uint32Array(DEFAULT_SIZE * DEFAULT_SIZE * DEFAULT_SIZE),

    tool: 'lapiz',
    color: '#FFFFFF',
    brushSize: 1,
    mirrorX: false, mirrorY: false, mirrorZ: false,

    showGrid: true,
    showAxes: true,
    wireframe: false,

    orbit: { theta: Math.PI / 4, phi: Math.PI / 2.8, radius: DEFAULT_SIZE * 3.2 },
    target: { x: 0, y: 0, z: 0 },

    undoStack: [],
    redoStack: []
};

let usuarioActual = null;

// ============================================================
//  THREE.JS — variables globales
// ============================================================
let scene, camera, renderer, mesh;
let ghost, gridHelper, axesHelper;
let meshDirty = false;
let renderQueued = false;

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300',
            '--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt',
            '--gray-50','--gray-100','--gray-200','--gray-300','--gray-400',
            '--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3',
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--shadow-glow',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
        if (scene) {
            const bg = getComputedStyle(document.documentElement)
                .getPropertyValue('--bg-alt').trim() || '#F5F5F8';
            scene.background = new THREE.Color(bg);
            requestRender();
        }
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('s3dToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 's3d-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const r = tx.objectStore(IDB_STORE).get(key);
            r.onsuccess = () => res(r.result);
            r.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

async function idbDelete(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveProyecto() {
    return 's3d_' + (usuarioActual?.codigo || 'invitado');
}

// ============================================================
//  COLOR — empaquetado RGBA en Uint32
// ============================================================
function packColor(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
}

function unpackColor(packed) {
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function packedToRGB01(packed) {
    return [
        ((packed >> 16) & 0xFF) / 255,
        ((packed >> 8) & 0xFF) / 255,
        (packed & 0xFF) / 255
    ];
}

// ============================================================
//  VOXEL ACCESS
// ============================================================
function voxIdx(x, y, z) {
    return x + y * state.size + z * state.size * state.size;
}

function getVoxel(x, y, z) {
    const S = state.size;
    if (x < 0 || y < 0 || z < 0 || x >= S || y >= S || z >= S) return 0;
    return state.voxels[voxIdx(x, y, z)];
}

function setVoxel(x, y, z, packed) {
    const S = state.size;
    if (x < 0 || y < 0 || z < 0 || x >= S || y >= S || z >= S) return false;
    const i = voxIdx(x, y, z);
    if (state.voxels[i] === packed) return false;
    state.voxels[i] = packed;
    return true;
}

function paintBrush(cx, cy, cz, packed) {
    const s = state.brushSize;
    const off = (s - 1) >> 1;
    const combos = [];
    const mxArr = state.mirrorX ? [false, true] : [false];
    const myArr = state.mirrorY ? [false, true] : [false];
    const mzArr = state.mirrorZ ? [false, true] : [false];
    for (const mx of mxArr)
        for (const my of myArr)
            for (const mz of mzArr)
                combos.push([mx, my, mz]);

    let changed = false;
    for (let dz = 0; dz < s; dz++) {
        for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) {
                const x = cx + dx - off;
                const y = cy + dy - off;
                const z = cz + dz - off;
                for (const [mx, my, mz] of combos) {
                    const fx = mx ? state.size - 1 - x : x;
                    const fy = my ? state.size - 1 - y : y;
                    const fz = mz ? state.size - 1 - z : z;
                    if (setVoxel(fx, fy, fz, packed)) changed = true;
                }
            }
        }
    }
    return changed;
}

// ============================================================
//  RENDER — Three.js init
// ============================================================
function initThree() {
    if (typeof THREE === 'undefined') {
        alert('No se pudo cargar Three.js. Revisá tu conexión.');
        return false;
    }

    const vp = document.getElementById('s3dViewport');

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vp.clientWidth, vp.clientHeight);
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none;';
    vp.insertBefore(renderer.domElement, vp.firstChild);

    scene = new THREE.Scene();

    const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-alt').trim() || '#F5F5F8';
    scene.background = new THREE.Color(bg);

    camera = new THREE.PerspectiveCamera(45, vp.clientWidth / vp.clientHeight, 0.1, 2000);

    // Luces: ambiente + 2 direccionales para volumen
    scene.add(new THREE.AmbientLight(0xFFFFFF, 0.62));
    const d1 = new THREE.DirectionalLight(0xFFFFFF, 0.78);
    d1.position.set(1, 2, 1.5);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xFFFFFF, 0.32);
    d2.position.set(-1.2, -0.6, -1);
    scene.add(d2);

    // Ghost cursor: cubo wireframe
    const ghostGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const ghostMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        depthTest: false
    });
    ghost = new THREE.Mesh(ghostGeo, ghostMat);
    ghost.renderOrder = 999;
    ghost.visible = false;
    scene.add(ghost);

    // Grid helper
    gridHelper = new THREE.GridHelper(state.size, state.size, 0x666666, 0xAAAAAA);
    gridHelper.position.y = -state.size / 2;
    gridHelper.material.opacity = 0.55;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Axes helper — anclado a la esquina del grid
    axesHelper = new THREE.AxesHelper(state.size / 4);
    axesHelper.position.set(-state.size / 2, -state.size / 2, -state.size / 2);
    scene.add(axesHelper);

    window.addEventListener('resize', onWindowResize);

    updateCamera();
    return true;
}

function onWindowResize() {
    if (!renderer || !camera) return;
    const vp = document.getElementById('s3dViewport');
    camera.aspect = vp.clientWidth / vp.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.clientWidth, vp.clientHeight);
    requestRender();
}

function updateCamera() {
    if (!camera) return;
    const { theta, phi, radius } = state.orbit;
    const t = state.target;
    camera.position.set(
        t.x + radius * Math.sin(phi) * Math.cos(theta),
        t.y + radius * Math.cos(phi),
        t.z + radius * Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(t.x, t.y, t.z);
    requestRender();
}

function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        if (renderer && scene && camera) renderer.render(scene, camera);
    });
}

// ============================================================
//  MESH BUILDING — solo caras visibles
// ============================================================
function rebuildMesh() {
    if (!scene) return;
    const S = state.size;
    const half = S / 2;
    const voxels = state.voxels;

    const positions = [];
    const normals   = [];
    const colors    = [];
    const indices   = [];

    for (let z = 0; z < S; z++) {
        const zOff = z * S * S;
        for (let y = 0; y < S; y++) {
            const yOff = y * S;
            for (let x = 0; x < S; x++) {
                const packed = voxels[x + yOff + zOff];
                if (!packed) continue;

                const [r, g, b] = packedToRGB01(packed);

                for (let f = 0; f < 6; f++) {
                    const face = FACES[f];
                    const nx = x + face.n[0];
                    const ny = y + face.n[1];
                    const nz = z + face.n[2];

                    if (nx >= 0 && nx < S && ny >= 0 && ny < S && nz >= 0 && nz < S) {
                        if (voxels[nx + ny * S + nz * S * S]) continue;
                    }

                    const base = positions.length / 3;
                    for (const v of face.v) {
                        positions.push(x + v[0] - half, y + v[1] - half, z + v[2] - half);
                        normals.push(face.n[0], face.n[1], face.n[2]);
                        colors.push(r, g, b);
                    }
                    indices.push(base, base+1, base+2, base, base+2, base+3);
                }
            }
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeBoundingSphere();

    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }

    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        wireframe: state.wireframe
    });
    mesh = new THREE.Mesh(geom, material);
    scene.add(mesh);

    updateInfoPanel();
    requestRender();
}

function markMeshDirty() {
    if (meshDirty) return;
    meshDirty = true;
    requestAnimationFrame(() => {
        meshDirty = false;
        rebuildMesh();
    });
}

function updateInfoPanel() {
    let count = 0;
    const v = state.voxels;
    for (let i = 0; i < v.length; i++) if (v[i]) count++;
    const el = document.getElementById('infoVoxeles');
    const elT = document.getElementById('infoTamano');
    const elVp = document.getElementById('vpInfo');
    if (el) el.textContent = count.toLocaleString('es-CL');
    if (elT) elT.textContent = `${state.size}×${state.size}×${state.size}`;
    if (elVp) elVp.textContent = count === 1 ? '1 voxel' : `${count.toLocaleString('es-CL')} voxeles`;
}

// ============================================================
//  RAYCAST DDA (Amanatides & Woo)
// ============================================================
function raycastVoxel(origin, dir) {
    const S = state.size;
    const half = S / 2;

    const ox = origin.x + half;
    const oy = origin.y + half;
    const oz = origin.z + half;

    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const dx = dir.x, dy = dir.y, dz = dir.z;
    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX, tMaxY, tMaxZ;
    if (stepX > 0) tMaxX = (Math.floor(ox) + 1 - ox) / dx;
    else if (stepX < 0) tMaxX = (Math.floor(ox) - ox) / dx;
    else tMaxX = Infinity;

    if (stepY > 0) tMaxY = (Math.floor(oy) + 1 - oy) / dy;
    else if (stepY < 0) tMaxY = (Math.floor(oy) - oy) / dy;
    else tMaxY = Infinity;

    if (stepZ > 0) tMaxZ = (Math.floor(oz) + 1 - oz) / dz;
    else if (stepZ < 0) tMaxZ = (Math.floor(oz) - oz) / dz;
    else tMaxZ = Infinity;

    let lastAxis = -1;
    const MAX_STEPS = Math.ceil(S * 2) + 12;
    const voxels = state.voxels;

    for (let i = 0; i < MAX_STEPS; i++) {
        if (x >= 0 && x < S && y >= 0 && y < S && z >= 0 && z < S) {
            if (voxels[x + y * S + z * S * S]) {
                let nx = 0, ny = 0, nz = 0;
                if (lastAxis === 0) nx = -stepX;
                else if (lastAxis === 1) ny = -stepY;
                else if (lastAxis === 2) nz = -stepZ;
                return {
                    hit: true,
                    voxel: { x, y, z },
                    newVoxel: { x: x + nx, y: y + ny, z: z + nz },
                    normal: { x: nx, y: ny, z: nz }
                };
            }
        }

        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            x += stepX; tMaxX += tDeltaX; lastAxis = 0;
        } else if (tMaxY < tMaxZ) {
            y += stepY; tMaxY += tDeltaY; lastAxis = 1;
        } else {
            z += stepZ; tMaxZ += tDeltaZ; lastAxis = 2;
        }

        const far = 5000;
        if (tMaxX > far && tMaxY > far && tMaxZ > far) break;
        if (x < -2 && stepX < 0) break;
        if (x > S + 1 && stepX > 0) break;
        if (y < -2 && stepY < 0) break;
        if (y > S + 1 && stepY > 0) break;
        if (z < -2 && stepZ < 0) break;
        if (z > S + 1 && stepZ > 0) break;
    }
    return { hit: false };
}

function screenToRay(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const origin = camera.position.clone();
    const target = new THREE.Vector3(ndcX, ndcY, 0.5);
    target.unproject(camera);
    const direction = target.sub(origin).normalize();
    return { origin, direction };
}

function raycastAt(clientX, clientY) {
    const ray = screenToRay(clientX, clientY);
    const hit = raycastVoxel(ray.origin, ray.direction);
    if (hit.hit) return hit;

    // Fallback: plano del suelo (y = -S/2)
    const S = state.size;
    const planeY = -S / 2;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    if (t > 0 && t < 8000) {
        const px = ray.origin.x + ray.direction.x * t;
        const pz = ray.origin.z + ray.direction.z * t;
        const gx = Math.floor(px + S / 2);
        const gz = Math.floor(pz + S / 2);
        if (gx >= 0 && gx < S && gz >= 0 && gz < S) {
            return {
                hit: false,
                voxel: null,
                newVoxel: { x: gx, y: 0, z: gz },
                normal: { x: 0, y: 1, z: 0 }
            };
        }
    }
    return null;
}

// ============================================================
//  GHOST CURSOR
// ============================================================
function updateGhost(clientX, clientY) {
    if (!ghost) return;
    if (state.tool === 'pipeta') { ghost.visible = false; requestRender(); return; }

    const ray = raycastAt(clientX, clientY);
    if (!ray) { ghost.visible = false; requestRender(); return; }

    let gx, gy, gz;
    if (state.tool === 'lapiz') {
        gx = ray.newVoxel.x; gy = ray.newVoxel.y; gz = ray.newVoxel.z;
    } else {
        if (!ray.voxel) { ghost.visible = false; requestRender(); return; }
        gx = ray.voxel.x; gy = ray.voxel.y; gz = ray.voxel.z;
    }

    const S = state.size;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= S || gy >= S || gz >= S) {
        ghost.visible = false;
        requestRender();
        return;
    }

    const size = state.brushSize;
    ghost.scale.set(size, size, size);
    const off = (size - 1) / 2;
    ghost.position.set(
        gx + 0.5 + off - S / 2,
        gy + 0.5 + off - S / 2,
        gz + 0.5 + off - S / 2
    );
    ghost.visible = true;
    ghost.material.color.set(state.tool === 'borrar' ? '#FF4444' :
                              state.tool === 'pintar' ? '#FFD700' : state.color);
    requestRender();
}

function hideGhost() {
    if (ghost) { ghost.visible = false; requestRender(); }
}

// ============================================================
//  SCULPT ACTION
// ============================================================
function applySculptAt(clientX, clientY) {
    const ray = raycastAt(clientX, clientY);
    if (!ray) return;

    const S = state.size;
    const voxels = state.voxels;
    let changed = false;

    if (state.tool === 'lapiz') {
        const target = ray.newVoxel;
        if (target.x >= 0 && target.x < S &&
            target.y >= 0 && target.y < S &&
            target.z >= 0 && target.z < S) {
            changed = paintBrush(target.x, target.y, target.z, packColor(state.color));
        }
    } else if (state.tool === 'borrar') {
        if (ray.voxel) {
            changed = paintBrush(ray.voxel.x, ray.voxel.y, ray.voxel.z, 0);
        }
    } else if (state.tool === 'pintar') {
        if (ray.voxel) {
            changed = paintBrush(ray.voxel.x, ray.voxel.y, ray.voxel.z, packColor(state.color));
        }
    } else if (state.tool === 'pipeta') {
        if (ray.voxel) {
            const packed = voxels[ray.voxel.x + ray.voxel.y * S + ray.voxel.z * S * S];
            if (packed) {
                setColor(unpackColor(packed));
                toast('Color copiado', 'info');
            }
        }
        return;
    }

    if (changed) markMeshDirty();
}

// ============================================================
//  UNDO / REDO
// ============================================================
function pushUndo() {
    const snap = new Uint32Array(state.voxels);
    state.undoStack.push(snap);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    updateUndoButtons();
}

function doUndo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(new Uint32Array(state.voxels));
    const prev = state.undoStack.pop();
    state.voxels.set(prev);
    markMeshDirty();
    updateUndoButtons();
}

function doRedo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(new Uint32Array(state.voxels));
    const next = state.redoStack.pop();
    state.voxels.set(next);
    markMeshDirty();
    updateUndoButtons();
}

function updateUndoButtons() {
    const d = document.getElementById('btnDeshacer');
    const r = document.getElementById('btnRehacer');
    if (d) d.disabled = state.undoStack.length === 0;
    if (r) r.disabled = state.redoStack.length === 0;
}

// ============================================================
//  POINTER EVENTS
// ============================================================
const pointers = new Map();
let gestureMode = null;
let actionStarted = false;
let orbitStart = null;
let panStart = null;
let pinch2Start = null;

function getEl() { return renderer?.domElement; }

function getPointerCenter() {
    const arr = [...pointers.values()];
    if (arr.length < 2) return { x: 0, y: 0 };
    return { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
}

function getPointerDist() {
    const arr = [...pointers.values()];
    if (arr.length < 2) return 0;
    return Math.hypot(arr[1].x - arr[0].x, arr[1].y - arr[0].y);
}

function getPointerAngle() {
    const arr = [...pointers.values()];
    if (arr.length < 2) return 0;
    return Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x);
}

function onPointerDown(e) {
    const el = getEl();
    if (!el) return;

    // ¿Es sobre los paneles flotantes? Ignorar
    const target = e.target;
    if (target && target.closest && target.closest(
        '.s3d-view-panel, .s3d-zoom-panel, .s3d-vp-info, .s3d-mirror-indicator, .s3d-hint'
    )) return;

    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // --- GESTOS MÓVILES 2 DEDOS ---
    if (e.pointerType === 'touch' && pointers.size === 2) {
        if (gestureMode === 'sculpt' && actionStarted) {
            doUndo();
            actionStarted = false;
        }
        gestureMode = 'camera';
        hideGhost();
        const centro = getPointerCenter();
        orbitStart = {
            theta: state.orbit.theta,
            phi: state.orbit.phi,
            radius: state.orbit.radius,
            tx: state.target.x,
            ty: state.target.y,
            tz: state.target.z
        };
        panStart = { mx: centro.x, my: centro.y };
        pinch2Start = {
            dist: getPointerDist(),
            angle: getPointerAngle()
        };
        return;
    }

    // --- DESKTOP: mouse ---
    if (e.pointerType === 'mouse') {
        // Botón derecho, medio, o Shift+izq → cámara
        if (e.button === 2 || e.button === 1) {
            gestureMode = 'camera';
            hideGhost();
            // CAMBIO: click medio siempre pan · Shift+click derecho también pan
            const esPan = (e.button === 1) || e.shiftKey;
            orbitStart = {
                theta: state.orbit.theta,
                phi: state.orbit.phi,
                radius: state.orbit.radius,
                tx: state.target.x,
                ty: state.target.y,
                tz: state.target.z,
                pan: esPan,
                mx: e.clientX,
                my: e.clientY
            };
            return;
        }
        if (e.button === 0) {
            // Alt+click izq = rotar (compatibilidad)
            if (e.altKey) {
                gestureMode = 'camera';
                hideGhost();
                orbitStart = {
                    theta: state.orbit.theta,
                    phi: state.orbit.phi,
                    radius: state.orbit.radius,
                    tx: state.target.x,
                    ty: state.target.y,
                    tz: state.target.z,
                    pan: false,
                    mx: e.clientX,
                    my: e.clientY
                };
                return;
            }
            // Escultura normal
            gestureMode = 'sculpt';
            pushUndo();
            actionStarted = true;
            applySculptAt(e.clientX, e.clientY);
            updateGhost(e.clientX, e.clientY);
            return;
        }
    }

    // --- TOUCH 1 DEDO → escultura ---
    if (e.pointerType === 'touch' && pointers.size === 1) {
        gestureMode = 'sculpt';
        pushUndo();
        actionStarted = true;
        applySculptAt(e.clientX, e.clientY);
        updateGhost(e.clientX, e.clientY);
    }
}

function onPointerMove(e) {
    const el = getEl();
    if (!el || !pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') updateGhost(e.clientX, e.clientY);
        return;
    }

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // --- GESTOS 2 DEDOS ---
    if (gestureMode === 'camera' && pointers.size === 2 && pinch2Start) {
        const centro = getPointerCenter();
        const dist = getPointerDist();
        const angle = getPointerAngle();

        const dMx = centro.x - panStart.mx;
        const dMy = centro.y - panStart.my;
        if (Math.abs(dMx) + Math.abs(dMy) > 0.5) {
            panCamera(dMx, dMy);
            panStart.mx = centro.x;
            panStart.my = centro.y;
        }

        if (pinch2Start.dist > 0) {
            const ratio = dist / pinch2Start.dist;
            if (Math.abs(1 - ratio) > 0.03) {
                state.orbit.radius = Math.max(4, Math.min(500, state.orbit.radius / ratio));
                pinch2Start.dist = dist;
                updateCamera();
            }
        }

        let dAngle = angle - pinch2Start.angle;
        if (Math.abs(dAngle) > 0.02) {
            while (dAngle > Math.PI) dAngle -= Math.PI * 2;
            while (dAngle < -Math.PI) dAngle += Math.PI * 2;
            state.orbit.theta -= dAngle * 1.2;
            pinch2Start.angle = angle;
            updateCamera();
        }
        return;
    }

    // --- CÁMARA DESKTOP ---
    if (gestureMode === 'camera' && orbitStart && e.pointerType === 'mouse') {
        const dx = e.clientX - orbitStart.mx;
        const dy = e.clientY - orbitStart.my;
        if (orbitStart.pan) {
            panCamera(dx, dy);
            orbitStart.mx = e.clientX;
            orbitStart.my = e.clientY;
        } else {
            state.orbit.theta -= dx * 0.008;
            state.orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, state.orbit.phi - dy * 0.008));
            orbitStart.mx = e.clientX;
            orbitStart.my = e.clientY;
            updateCamera();
        }
        return;
    }

    // --- ESCULTURA ---
    if (gestureMode === 'sculpt') {
        applySculptAt(e.clientX, e.clientY);
        updateGhost(e.clientX, e.clientY);
        return;
    }

    // --- HOVER ---
    if (e.pointerType === 'mouse') {
        updateGhost(e.clientX, e.clientY);
    }
}

function onPointerUp(e) {
    if (!renderer) return;

    const wasGesture = gestureMode;
    pointers.delete(e.pointerId);

    if (wasGesture === 'sculpt' && pointers.size === 0) {
        actionStarted = false;
        gestureMode = null;
        hideGhost();
    } else if (wasGesture === 'camera') {
        if (pointers.size === 0) {
            gestureMode = null;
            orbitStart = null;
            pinch2Start = null;
        } else if (pointers.size === 1 && e.pointerType === 'touch') {
            gestureMode = null;
        }
    } else if (wasGesture === 'sculpt' && pointers.size > 0) {
        gestureMode = null;
    }
}

function panCamera(dx, dy) {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, forward);

    // CAMBIO: sensibilidad subida de 0.0018 a 0.0028
    const scale = state.orbit.radius * 0.0028;
    state.target.x -= right.x * dx * scale - up.x * dy * scale;
    state.target.y -= right.y * dx * scale - up.y * dy * scale;
    state.target.z -= right.z * dx * scale - up.z * dy * scale;
    updateCamera();
}

// ============================================================
//  WHEEL ZOOM
// ============================================================
function setupWheel() {
    const el = getEl();
    if (!el) return;
    el.addEventListener('wheel', (e) => {
        e.preventDefault();
        // CAMBIO: 25% por muesca en vez de 10%
        const factor = e.deltaY > 0 ? 1.25 : (1 / 1.25);
        state.orbit.radius = Math.max(4, Math.min(500, state.orbit.radius * factor));
        updateCamera();
    }, { passive: false });
}

// ============================================================
//  TECLADO
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); doUndo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault(); doRedo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); guardarProyectoHandler(); return;
    }
    if (e.ctrlKey || e.metaKey) return;

    const shortcuts = { b: 'lapiz', e: 'borrar', p: 'pintar', i: 'pipeta' };
    const k = e.key.toLowerCase();
    if (shortcuts[k]) { activarHerramienta(shortcuts[k]); return; }
    if (k === 'h') { toggleGrid(); return; }
    if (k === 'f') { vistaFit(); return; }
    if (k === '1') { setBrushSize(1); return; }
    if (k === '2') { setBrushSize(2); return; }
    if (k === '3') { setBrushSize(3); return; }
});

// ============================================================
//  HERRAMIENTAS / COLOR / BRUSH
// ============================================================
function activarHerramienta(t) {
    state.tool = t;
    document.querySelectorAll('.s3d-tool-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tool === t);
    });
    document.querySelectorAll('.s3d-tool-nav').forEach(b => {
        if (['lapiz','borrar','pintar','pipeta'].includes(b.dataset.accion)) {
            b.classList.toggle('activo', b.dataset.accion === t);
        }
    });
    hideGhost();
}

function setBrushSize(s) {
    state.brushSize = s;
    document.querySelectorAll('.s3d-size-btn[data-size]').forEach(b => {
        b.classList.toggle('activo', parseInt(b.dataset.size, 10) === s);
    });
}

function setColor(hex) {
    state.color = hex.toUpperCase();
    const picker = document.getElementById('colorPicker');
    const hexEl = document.getElementById('colorHex');
    if (picker) picker.value = state.color;
    if (hexEl) hexEl.textContent = state.color;
    document.querySelectorAll('.s3d-paleta-grid .s3d-color-btn').forEach(b => {
        b.classList.toggle('seleccionado', b.dataset.color === state.color);
    });
}

function renderPaleta() {
    const grid = document.getElementById('paletaGrid');
    if (!grid) return;
    grid.innerHTML = '';
    PALETA_DEFAULT.forEach(c => {
        const b = document.createElement('button');
        b.className = 's3d-color-btn';
        b.type = 'button';
        b.style.background = c;
        b.dataset.color = c.toUpperCase();
        b.title = c;
        if (c.toUpperCase() === state.color) b.classList.add('seleccionado');
        b.addEventListener('click', () => setColor(c));
        grid.appendChild(b);
    });
}

// ============================================================
//  VISTA
// ============================================================
function toggleGrid() {
    state.showGrid = !state.showGrid;
    if (gridHelper) gridHelper.visible = state.showGrid;
    const btn = document.getElementById('btnGrid');
    if (btn) btn.classList.toggle('activo', state.showGrid);
    const chk = document.getElementById('toggleGrid');
    if (chk) chk.checked = state.showGrid;
    requestRender();
}

function toggleWireframe() {
    state.wireframe = !state.wireframe;
    if (mesh) mesh.material.wireframe = state.wireframe;
    const chk = document.getElementById('toggleWireframe');
    if (chk) chk.checked = state.wireframe;
    requestRender();
}

function vistaFit() {
    state.orbit.radius = state.size * 3.2;
    state.target = { x: 0, y: -state.size / 8, z: 0 };
    updateCamera();
}

function vistaReset() {
    state.orbit.theta = Math.PI / 4;
    state.orbit.phi = Math.PI / 2.8;
    state.orbit.radius = state.size * 3.2;
    state.target = { x: 0, y: -state.size / 8, z: 0 };
    updateCamera();
}

function vistaTop() {
    state.orbit.theta = 0;
    state.orbit.phi = 0.05;
    state.orbit.radius = state.size * 2.4;
    state.target = { x: 0, y: 0, z: 0 };
    updateCamera();
}

function vistaFront() {
    state.orbit.theta = 0;
    state.orbit.phi = Math.PI / 2;
    state.orbit.radius = state.size * 2.4;
    state.target = { x: 0, y: 0, z: 0 };
    updateCamera();
}

// ============================================================
//  HELPERS DE ESCENA (grid + axes)
// ============================================================
function rebuildSceneHelpers(size) {
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry.dispose();
        gridHelper.material.dispose();
    }
    gridHelper = new THREE.GridHelper(size, size, 0x666666, 0xAAAAAA);
    gridHelper.position.y = -size / 2;
    gridHelper.material.opacity = 0.55;
    gridHelper.material.transparent = true;
    gridHelper.visible = state.showGrid;
    scene.add(gridHelper);

    if (axesHelper) {
        scene.remove(axesHelper);
        axesHelper.geometry.dispose();
        axesHelper.material.dispose();
    }
    axesHelper = new THREE.AxesHelper(size / 4);
    axesHelper.position.set(-size / 2, -size / 2, -size / 2);
    axesHelper.visible = state.showAxes;
    scene.add(axesHelper);
}

// ============================================================
//  PROYECTO
// ============================================================
function crearProyecto(size) {
    state.size = size;
    state.voxels = new Uint32Array(size * size * size);
    state.undoStack = [];
    state.redoStack = [];

    // Cámara inicial: más lejos y mirando un poco hacia abajo
    state.orbit.radius = size * 3.2;
    state.orbit.theta = Math.PI / 4;
    state.orbit.phi = Math.PI / 2.8;
    state.target = { x: 0, y: -size / 8, z: 0 };

    rebuildSceneHelpers(size);
    updateCamera();
    markMeshDirty();
    updateUndoButtons();
}

async function guardarProyectoHandler() {
    try {
        await idbSet(claveProyecto(), {
            version: 1,
            size: state.size,
            voxels: state.voxels,
            fecha: new Date().toISOString()
        });
        toast('Proyecto guardado', 'success');
    } catch (e) {
        console.warn(e);
        toast('No se pudo guardar', 'error');
    }
}

async function cargarProyectoLocal() {
    return await idbGet(claveProyecto());
}

async function borrarProyectoLocal() {
    await idbDelete(claveProyecto());
}

function cargarProyectoDesdeData(data) {
    const size = data.size || DEFAULT_SIZE;
    state.size = size;

    rebuildSceneHelpers(size);

    if (data.voxels && data.voxels.length === size * size * size) {
        state.voxels = new Uint32Array(data.voxels);
    } else {
        state.voxels = new Uint32Array(size * size * size);
    }

    state.undoStack = [];
    state.redoStack = [];

    // Cámara inicial: más lejos y mirando un poco hacia abajo
    state.orbit.radius = size * 3.2;
    state.orbit.theta = Math.PI / 4;
    state.orbit.phi = Math.PI / 2.8;
    state.target = { x: 0, y: -size / 8, z: 0 };

    updateCamera();
    markMeshDirty();
    updateUndoButtons();
}

// ============================================================
//  EXPORTAR
// ============================================================
function exportarOBJ() {
    const S = state.size;
    const lines = [
        '# Sill3Dy voxel export',
        `# Creado: ${new Date().toISOString()}`,
        `# Grid: ${S}x${S}x${S}`
    ];

    let vCount = 0;
    const voxels = state.voxels;

    for (let z = 0; z < S; z++) {
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const packed = voxels[x + y * S + z * S * S];
                if (!packed) continue;

                const [r, g, b] = packedToRGB01(packed);
                for (const face of FACES) {
                    const nx = x + face.n[0];
                    const ny = y + face.n[1];
                    const nz = z + face.n[2];
                    if (nx >= 0 && nx < S && ny >= 0 && ny < S && nz >= 0 && nz < S) {
                        if (voxels[nx + ny * S + nz * S * S]) continue;
                    }
                    const idxs = [];
                    for (const v of face.v) {
                        vCount++;
                        lines.push(`v ${x + v[0]} ${y + v[1]} ${z + v[2]} ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`);
                        idxs.push(vCount);
                    }
                    lines.push(`f ${idxs[0]} ${idxs[1]} ${idxs[2]} ${idxs[3]}`);
                }
            }
        }
    }

    const blob = new Blob([lines.join('\n')], { type: 'model/obj' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sill3dy_${Date.now()}.obj`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Modelo OBJ exportado', 'success');
    document.getElementById('modalExportar').hidden = true;
}

function exportarPNG() {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `sill3dy_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Captura PNG descargada', 'success');
    document.getElementById('modalExportar').hidden = true;
}

async function guardarEnGaleria() {
    const titulo = (document.getElementById('inputTitulo').value || '').trim() || 'Sill3Dy';
    const mh = MH();
    if (!mh) { toast('Sin conexión al sistema', 'error'); return; }

    try {
        renderer.render(scene, camera);
        const dataURL = renderer.domElement.toDataURL('image/png');
        const blob = await (await fetch(dataURL)).blob();

        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre: titulo + '.png',
            carpeta: 'c_general',
            comprimir: false
        });

        toast('Guardado en Galería', 'success');
        document.getElementById('modalGaleria').hidden = true;
        document.getElementById('modalExportar').hidden = true;
    } catch (e) {
        console.warn(e);
        toast(e.message || 'No se pudo guardar', 'error');
    }
}

// ============================================================
//  MODAL SESIÓN
// ============================================================
function preguntarContinuarSesion(data) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalSesion');
        const fecha = document.getElementById('modalSesionFecha');
        if (fecha && data.fecha) {
            const d = new Date(data.fecha);
            fecha.textContent = 'Guardado el ' + d.toLocaleString('es-CL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
        modal.hidden = false;
        if (window.lucide) window.lucide.createIcons();

        const cerrar = (modo) => {
            modal.hidden = true;
            resolve(modo);
        };
        document.getElementById('btnContinuarSesion').onclick = () => cerrar('continuar');
        document.getElementById('btnNuevaSesion').onclick = () => cerrar('nueva');
        document.getElementById('btnDescartarSesion').onclick = () => cerrar('descartar');
    });
}

// ============================================================
//  UI MÓVIL
// ============================================================
function inicializarUIMovil() {
    const panel = document.getElementById('s3dPanel');
    const panelTitulo = document.getElementById('s3dPanelTitulo');
    const toolbar = document.getElementById('s3dToolbar');
    if (!panel || !toolbar) return;

    const titulos = {
        paleta: { icono: 'palette', texto: 'Paleta' },
        herramientas: { icono: 'brush', texto: 'Herramientas' },
        modelo: { icono: 'box', texto: 'Modelo' }
    };

    function abrirPanel(tab) {
        panel.querySelectorAll('.s3d-panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        panel.querySelectorAll('.s3d-seccion').forEach(s => {
            s.classList.toggle('activa', s.dataset.seccion === tab);
        });
        const info = titulos[tab] || titulos.paleta;
        if (panelTitulo) {
            panelTitulo.innerHTML = `<i data-lucide="${info.icono}"></i><span>${info.texto}</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
        panel.classList.add('abierto');
    }

    function cerrarPanel() { panel.classList.remove('abierto'); }

    panel.querySelectorAll('.s3d-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => abrirPanel(tab.dataset.tab));
    });

    document.getElementById('s3dPanelCerrar')?.addEventListener('click', cerrarPanel);
    panel.addEventListener('click', (e) => {
        if (e.target === panel) cerrarPanel();
    });

    toolbar.querySelectorAll('.s3d-tool-nav').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = btn.dataset.accion;
            if (['lapiz','borrar','pintar','pipeta'].includes(a)) {
                activarHerramienta(a);
                toolbar.querySelectorAll('.s3d-tool-nav').forEach(b => {
                    if (['lapiz','borrar','pintar','pipeta'].includes(b.dataset.accion)) {
                        b.classList.toggle('activo', b.dataset.accion === a);
                    }
                });
                return;
            }
            if (a === 'deshacer') { doUndo(); return; }
            if (a === 'paleta' || a === 'modelo') abrirPanel(a);
        });
    });
}

// ============================================================
//  WIRING DE UI
// ============================================================
function wireUI() {
    document.getElementById('btnNuevoProyecto')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('btnDeshacer')?.addEventListener('click', doUndo);
    document.getElementById('btnRehacer')?.addEventListener('click', doRedo);
    document.getElementById('btnGuardarProyecto')?.addEventListener('click', guardarProyectoHandler);
    document.getElementById('btnExportar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });

    // Zoom
    document.getElementById('zoomIn')?.addEventListener('click', () => {
        state.orbit.radius = Math.max(4, state.orbit.radius / 1.25);
        updateCamera();
    });
    document.getElementById('zoomOut')?.addEventListener('click', () => {
        state.orbit.radius = Math.min(500, state.orbit.radius * 1.25);
        updateCamera();
    });
    document.getElementById('zoomFit')?.addEventListener('click', vistaFit);
    document.getElementById('viewReset')?.addEventListener('click', vistaReset);
    document.getElementById('viewTop')?.addEventListener('click', vistaTop);
    document.getElementById('viewFront')?.addEventListener('click', vistaFront);
    document.getElementById('btnGrid')?.addEventListener('click', toggleGrid);

    // Palette
    document.getElementById('colorPicker')?.addEventListener('input', (e) => setColor(e.target.value));

    // Tools
    document.querySelectorAll('.s3d-tool-btn').forEach(b => {
        b.addEventListener('click', () => {
            activarHerramienta(b.dataset.tool);
            document.querySelectorAll('.s3d-tool-nav').forEach(n => {
                if (['lapiz','borrar','pintar','pipeta'].includes(n.dataset.accion)) {
                    n.classList.toggle('activo', n.dataset.accion === b.dataset.tool);
                }
            });
        });
    });

    // Brush size
    document.querySelectorAll('.s3d-size-btn[data-size]').forEach(b => {
        b.addEventListener('click', () => setBrushSize(parseInt(b.dataset.size, 10)));
    });

    // Mirror
    document.getElementById('btnMirrorX')?.addEventListener('click', () => {
        state.mirrorX = !state.mirrorX;
        document.getElementById('btnMirrorX').classList.toggle('activo', state.mirrorX);
        updateMirrorIndicator();
    });
    document.getElementById('btnMirrorY')?.addEventListener('click', () => {
        state.mirrorY = !state.mirrorY;
        document.getElementById('btnMirrorY').classList.toggle('activo', state.mirrorY);
        updateMirrorIndicator();
    });
    document.getElementById('btnMirrorZ')?.addEventListener('click', () => {
        state.mirrorZ = !state.mirrorZ;
        document.getElementById('btnMirrorZ').classList.toggle('activo', state.mirrorZ);
        updateMirrorIndicator();
    });

    // Modelo
    document.getElementById('btnNuevoDesdePanel')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('btnLimpiarTodo')?.addEventListener('click', () => {
        if (!confirm('¿Borrar todos los voxeles del modelo actual?')) return;
        pushUndo();
        state.voxels.fill(0);
        markMeshDirty();
        toast('Modelo limpiado', 'success');
    });

    // View toggles
    document.getElementById('toggleGrid')?.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
        if (gridHelper) gridHelper.visible = state.showGrid;
        document.getElementById('btnGrid')?.classList.toggle('activo', state.showGrid);
        requestRender();
    });
    document.getElementById('toggleAxes')?.addEventListener('change', (e) => {
        state.showAxes = e.target.checked;
        if (axesHelper) axesHelper.visible = state.showAxes;
        requestRender();
    });
    document.getElementById('toggleWireframe')?.addEventListener('change', (e) => {
        state.wireframe = e.target.checked;
        if (mesh) mesh.material.wireframe = state.wireframe;
        requestRender();
    });

    // Modal nuevo
    let tamañoSeleccionado = DEFAULT_SIZE;
    document.querySelectorAll('.s3d-preset-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.s3d-preset-btn').forEach(x => x.classList.remove('activo'));
            b.classList.add('activo');
            tamañoSeleccionado = parseInt(b.dataset.size, 10);
            document.getElementById('customSize').value = '';
        });
    });
    document.getElementById('btnCustomSize')?.addEventListener('click', () => {
        const v = parseInt(document.getElementById('customSize').value, 10);
        if (isNaN(v) || v < 8 || v > 64) { toast('Usá un tamaño entre 8 y 64', 'error'); return; }
        tamañoSeleccionado = v;
        document.querySelectorAll('.s3d-preset-btn').forEach(x => x.classList.remove('activo'));
    });
    document.getElementById('btnCancelarNuevo')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = true;
    });
    document.getElementById('btnConfirmarNuevo')?.addEventListener('click', () => {
        crearProyecto(tamañoSeleccionado);
        document.getElementById('modalNuevo').hidden = true;
        toast('Modelo creado', 'success');
    });
    document.getElementById('modalNuevoCerrar')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = true;
    });

    // Modal exportar
    document.getElementById('btnExportOBJ')?.addEventListener('click', exportarOBJ);
    document.getElementById('btnExportPNG')?.addEventListener('click', exportarPNG);
    document.getElementById('btnSaveGaleria')?.addEventListener('click', () => {
        renderer.render(scene, camera);
        const dataURL = renderer.domElement.toDataURL('image/png');
        const mini = document.getElementById('miniPreview');
        if (mini) {
            mini.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataURL;
            mini.appendChild(img);
        }
        const ahora = new Date();
        const tit = document.getElementById('inputTitulo');
        if (tit) {
            tit.value = `Voxel ${ahora.toLocaleDateString('es-CL')} ${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
            setTimeout(() => tit.focus(), 80);
        }
        document.getElementById('modalExportar').hidden = true;
        document.getElementById('modalGaleria').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('modalExportarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });

    // Modal galería
    document.getElementById('btnCancelarGaleria')?.addEventListener('click', () => {
        document.getElementById('modalGaleria').hidden = true;
    });
    document.getElementById('modalGaleriaCerrar')?.addEventListener('click', () => {
        document.getElementById('modalGaleria').hidden = true;
    });
    document.getElementById('btnConfirmarGaleria')?.addEventListener('click', guardarEnGaleria);

    // Cerrar modales con click fondo
    ['modalNuevo', 'modalExportar', 'modalGaleria'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) m.hidden = true;
        });
    });

    // ESC
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        ['modalNuevo', 'modalExportar', 'modalGaleria'].forEach(id => {
            const m = document.getElementById(id);
            if (m && !m.hidden) { m.hidden = true; }
        });
    });

    // Hint
    const hintEl = document.getElementById('s3dHint');
    const btnCerrarHint = document.getElementById('s3dHintCerrar');
    if (hintEl && !localStorage.getItem(HINT_KEY)) {
        hintEl.hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }
    btnCerrarHint?.addEventListener('click', () => {
        hintEl.hidden = true;
        try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
    });
}

function updateMirrorIndicator() {
    const ind = document.getElementById('mirrorIndicator');
    const txt = document.getElementById('mirrorTxt');
    if (!ind) return;
    const activos = [];
    if (state.mirrorX) activos.push('X');
    if (state.mirrorY) activos.push('Y');
    if (state.mirrorZ) activos.push('Z');
    if (activos.length === 0) {
        ind.hidden = true;
    } else {
        ind.hidden = false;
        txt.textContent = 'Simetría ' + activos.join(' · ');
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    if (typeof THREE === 'undefined') {
        document.getElementById('s3dViewport').innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">No se pudo cargar Three.js</div>';
        return;
    }

    const api = API();
    if (!api) { alert('Sill3Dy necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Sill3Dy.'); return; }

    const badge = document.getElementById('s3dUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    if (!initThree()) return;

    const el = getEl();
    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && !gestureMode) hideGhost();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    setupWheel();

    // Cargar proyecto
    let proyectoCargado = false;
    try {
        const guardado = await cargarProyectoLocal();
        if (guardado && guardado.voxels && guardado.size) {
            const decision = await preguntarContinuarSesion(guardado);
            if (decision === 'continuar') {
                cargarProyectoDesdeData(guardado);
                toast('Proyecto restaurado', 'success');
                proyectoCargado = true;
            } else if (decision === 'descartar') {
                await borrarProyectoLocal();
            }
        }
    } catch (e) { console.warn(e); }

    if (!proyectoCargado) {
        crearProyecto(DEFAULT_SIZE);
    }

    renderPaleta();
    setColor('#FFFFFF');

    inicializarUIMovil();
    wireUI();
    updateUndoButtons();
    updateMirrorIndicator();

    window.addEventListener('pagehide', () => {
        if (usuarioActual && state.voxels) {
            idbSet(claveProyecto(), {
                version: 1,
                size: state.size,
                voxels: state.voxels,
                fecha: new Date().toISOString()
            }).catch(() => {});
        }
    });

    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
        toast('1 dedo = esculpir · 2 dedos = mover cámara', 'info');
    }, 800);
}

document.addEventListener('DOMContentLoaded', inicializar);
