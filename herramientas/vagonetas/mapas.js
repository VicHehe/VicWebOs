// ============================================================
//  Vagonetas — Catálogo de mapas
//  ------------------------------------------------------------
//  Cada mapa requiere un tema instalado. Si el usuario no lo
//  tiene, aparece con candado.
//
//  Colores hardcodeados que representan cada tema. No leen las
//  CSS vars en runtime para evitar complejidad — son valores
//  fijos que evocan cada estética.
// ============================================================

const MAPAS = [
    {
        id: 'canon-violeta',
        nombre: 'Cañón Violeta',
        descripcion: 'Circuito base de VicWebOs. Neón púrpura.',
        requiereTema: 'violeta',
        esBase: true,

        cielo:      0x15102a,
        niebla:     { color: 0x15102a, near: 35, far: 200 },
        luzAmb:     { color: 0xa78bfa, intensidad: 0.85 },
        luzDir:     { color: 0xf0e8ff, intensidad: 1.15, pos: [14, 24, 10] },
        suelo:      0x1e1538,
        riel:       0x7c3aed,
        rielMetal:  0xa78bfa,
        obstaculo:  0x4c1d95,
        obstaculoB: 0x2e1065,
        jugador:    0x8b5cf6,
        rival1:     0xef4444,
        rival2:     0x10b981
    },
    {
        id: 'amanecer',
        nombre: 'Amanecer',
        descripcion: 'Cielo de fuego sobre el mar. Rieles dorados.',
        requiereTema: 'break-of-dawn',
        esBase: false,

        cielo:      0xff8c5a,
        niebla:     { color: 0xff8c5a, near: 40, far: 240 },
        luzAmb:     { color: 0xffd9b8, intensidad: 1.0 },
        luzDir:     { color: 0xffa07a, intensidad: 1.4, pos: [14, 24, 10] },
        suelo:      0xe65a2d,
        riel:       0xff8c61,
        rielMetal:  0xffe0d1,
        obstaculo:  0xbf360c,
        obstaculoB: 0x8c2a08,
        jugador:    0xff7043,
        rival1:     0xdc2626,
        rival2:     0x0891b2
    },
    {
        id: 'escenario',
        nombre: 'Escenario',
        descripcion: 'Luces rojas y doradas. Circuito de las estrellas.',
        requiereTema: 'pop-owner',
        esBase: false,

        cielo:      0x0a0a0a,
        niebla:     { color: 0x0a0a0a, near: 35, far: 190 },
        luzAmb:     { color: 0xdc2626, intensidad: 0.7 },
        luzDir:     { color: 0xeab308, intensidad: 1.3, pos: [14, 24, 10] },
        suelo:      0x141414,
        riel:       0xdc2626,
        rielMetal:  0xeab308,
        obstaculo:  0x7f1d1d,
        obstaculoB: 0x450a0a,
        jugador:    0xdc2626,
        rival1:     0xeab308,
        rival2:     0x8b5cf6
    },
    {
        id: 'mina-steampunk',
        nombre: 'Mina Steampunk',
        descripcion: 'Taller victoriano. Rieles de bronce y engranajes.',
        requiereTema: 'steampunk',
        esBase: false,

        cielo:      0x2a1810,
        niebla:     { color: 0x2a1810, near: 30, far: 170 },
        luzAmb:     { color: 0xc9a961, intensidad: 0.85 },
        luzDir:     { color: 0xf0e8d8, intensidad: 1.1, pos: [14, 24, 10] },
        suelo:      0x3a2818,
        riel:       0x9c5f28,
        rielMetal:  0xc9a961,
        obstaculo:  0x653c19,
        obstaculoB: 0x3a2110,
        jugador:    0xb87333,
        rival1:     0x804d20,
        rival2:     0xc9a961
    }
];

window.MAPAS = MAPAS;
