// ============================================================
//  Vagonetas — Catálogo de mapas
//  ------------------------------------------------------------
//  Cada mapa define colores + decoración ÚNICA. La decoración
//  hace que cada mapa se sienta DISTINTO, no solo un recolor.
// ============================================================

const MAPAS = [
    {
        id: 'canon-violeta',
        nombre: 'Cañón Violeta',
        descripcion: 'Cristales de neón flotando alrededor.',
        requiereTema: 'violeta',
        esBase: true,

        cielo:      0x0a0618,
        niebla:     { color: 0x0a0618, near: 40, far: 220 },
        luzAmb:     { color: 0x8b5cf6, intensidad: 0.7 },
        luzDir:     { color: 0xf0e8ff, intensidad: 1.2, pos: [14, 24, 10] },
        suelo:      0x1e1538,
        riel:       0x7c3aed,
        rielMetal:  0xa78bfa,
        obstaculo:  0x4c1d95,
        obstaculoB: 0x2e1065,
        jugador:    0x8b5cf6,
        rival1:     0xef4444,
        rival2:     0x10b981,

        decoracion: 'cristales',
        decoColor:  0xa78bfa
    },
    {
        id: 'amanecer',
        nombre: 'Amanecer',
        descripcion: 'Sol gigante sobre el horizonte y ruta de fuego.',
        requiereTema: 'break-of-dawn',
        esBase: false,

        cielo:      0xff8c5a,
        niebla:     { color: 0xff8c5a, near: 45, far: 260 },
        luzAmb:     { color: 0xffd9b8, intensidad: 1.05 },
        luzDir:     { color: 0xffa07a, intensidad: 1.5, pos: [14, 24, 10] },
        suelo:      0xe65a2d,
        riel:       0xff8c61,
        rielMetal:  0xffe0d1,
        obstaculo:  0xbf360c,
        obstaculoB: 0x8c2a08,
        jugador:    0xff7043,
        rival1:     0xdc2626,
        rival2:     0x0891b2,

        decoracion: 'sol',
        decoColor:  0xffe0c4
    },
    {
        id: 'escenario',
        nombre: 'Escenario',
        descripcion: 'Luces de neón y reflectores barriendo la pista.',
        requiereTema: 'pop-owner',
        esBase: false,

        cielo:      0x0a0a0a,
        niebla:     { color: 0x0a0a0a, near: 40, far: 200 },
        luzAmb:     { color: 0xdc2626, intensidad: 0.6 },
        luzDir:     { color: 0xeab308, intensidad: 1.4, pos: [14, 24, 10] },
        suelo:      0x141414,
        riel:       0xdc2626,
        rielMetal:  0xeab308,
        obstaculo:  0x7f1d1d,
        obstaculoB: 0x450a0a,
        jugador:    0xdc2626,
        rival1:     0xeab308,
        rival2:     0x8b5cf6,

        decoracion: 'reflectores',
        decoColor:  0xeab308
    },
    {
        id: 'mina-steampunk',
        nombre: 'Mina Steampunk',
        descripcion: 'Engranajes victorianos girando sin parar.',
        requiereTema: 'steampunk',
        esBase: false,

        cielo:      0x1a0e08,
        niebla:     { color: 0x1a0e08, near: 35, far: 180 },
        luzAmb:     { color: 0xc9a961, intensidad: 0.8 },
        luzDir:     { color: 0xf0e8d8, intensidad: 1.15, pos: [14, 24, 10] },
        suelo:      0x3a2818,
        riel:       0x9c5f28,
        rielMetal:  0xc9a961,
        obstaculo:  0x653c19,
        obstaculoB: 0x3a2110,
        jugador:    0xb87333,
        rival1:     0x804d20,
        rival2:     0xc9a961,

        decoracion: 'engranajes',
        decoColor:  0xc9a961
    }
];

window.MAPAS = MAPAS;
