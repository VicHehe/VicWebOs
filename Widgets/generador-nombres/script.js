// ============================================================
//  Widget: Generador de Nombres (v4 — Lista Curada)
//  ------------------------------------------------------------
//  En lugar de sintetizar, elige al azar de un banco curado de
//  ~600 nombres reales organizados por estilo y género.
//
//  Estilos:
//    latino   → nombres hispanos (Chile, México, Arg, España)
//    japones  → nombres japoneses romanizados
//    anglo    → nombres anglosajones
//    fantasia → nombres de fantasía literaria
//
//  SIN persistencia. Evita repetir el nombre anterior.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  BANCO DE NOMBRES
// ============================================================
const NOMBRES = {

    // --------------------------------------------------------
    //  LATINO
    // --------------------------------------------------------
    latino: {
        masc: [
            'Nicolás','Nicol','Amaro','Antonio','José','Juan','Manuel','Francisco',
            'Luis','Javier','Miguel','Ángel','Carlos','Jesús','David','Pedro',
            'Alejandro','Fernando','Sergio','Ricardo','Eduardo','Roberto','Daniel',
            'Pablo','Andrés','Adrián','Diego','Rafael','Gonzalo','Tomás','Martín',
            'Agustín','Felipe','Ignacio','Matías','Sebastián','Cristóbal','Ramiro',
            'Mauricio','Rodrigo','Fabricio','Leonardo','Marcelo','Octavio','Santiago',
            'Benjamín','Joaquín','Maximiliano','Lucas','Mateo','Vicente','Renato',
            'Bruno','Alonso','Bastián','Emilio','Héctor','Víctor','Óscar','Hugo',
            'Iván','Álvaro','Arturo','Enrique','Alberto','Ramón','Salvador','Julio',
            'César','Raúl','Félix','Rubén','Esteban','Gaspar','Baltazar','Facundo',
            'Lautaro','Thiago','Bautista','Santino','Dante','Franco','Valentino',
            'Lorenzo','Ezequiel','Federico','Nahuel','Iñaki','Aitor','Unai','Gael',
            'Axel','Damián','Julián','Simón','Elías','Gabriel','Samuel','Adolfo',
            'Rogelio','Efraín','Ismael','Aníbal','Eugenio','Bernardo','Fermín',
            'Leandro','Alfonso','Gustavo','Osvaldo','Hernán','Mario','Pedro'
        ],
        fem: [
            'Valentina','Camila','Isidora','Josefa','Florencia','Martina','Catalina',
            'Antonia','Javiera','Emilia','Sofía','Lucía','María','Carmen','Paula',
            'Andrea','Daniela','Gabriela','Valeria','Fernanda','Constanza','Trinidad',
            'Magdalena','Rosario','Esperanza','Soledad','Amparo','Dolores','Pilar',
            'Beatriz','Elena','Irene','Lorena','Marcela','Patricia','Verónica',
            'Alejandra','Carolina','Cecilia','Claudia','Gloria','Silvia','Teresa',
            'Isabel','Ana','Marta','Sara','Julia','Clara','Ángela','Rosa','Leticia',
            'Mónica','Natalia','Amanda','Renata','Agustina','Julieta','Antonella',
            'Guadalupe','Ximena','Regina','Delfina','Malena','Micaela','Bianca',
            'Oriana','Alondra','Aitana','Cayetana','Jimena','Luisa','Manuela',
            'Ramona','Rita','Ofelia','Margarita','Inés','Alma','Ainhoa','Nahia',
            'Zoe','Emma','Olivia','Chloe','Mia','Paloma','Violeta','Aurora',
            'Ámbar','Luna','Estrella','Perla','Abril','Milagros','Trinidad',
            'Consuelo','Dominga','Fresia','Aylin','Antü','Rayén','Küyen','Millaray'
        ]
    },

    // --------------------------------------------------------
    //  JAPONÉS
    // --------------------------------------------------------
    japones: {
        masc: [
            'Haruki','Takeshi','Kenta','Yuki','Kenji','Hiroshi','Takumi','Daisuke',
            'Akira','Ren','Kaito','Riku','Sota','Yuto','Daiki','Ryota','Kazuya',
            'Shinji','Ryu','Ryuu','Ryosuke','Ichiro','Jiro','Katsuo','Satoshi',
            'Masaru','Toshiro','Kazuki','Haruto','Ryo','Makoto','Hikaru','Isamu',
            'Ryusei','Yuma','Hayato','Itsuki','Minato','Asahi','Sora','Hinata',
            'Kanata','Aoto','Tsubasa','Kai','Renjiro','Kazuma','Keisuke','Kiyoshi',
            'Masato','Noboru','Osamu','Riku','Saburo','Shigeru','Shiro','Tadashi',
            'Takao','Tetsuya','Tomoya','Yasuo','Yuuto','Yuu','Kaoru','Naoki'
        ],
        fem: [
            'Haruko','Kasumi','Tomoe','Sakura','Aiko','Yumi','Naomi','Keiko',
            'Michiko','Yoko','Hana','Hikari','Asuka','Mio','Saki','Mei','Yuna',
            'Hina','Rin','Kaede','Tsubaki','Ayame','Fuyuko','Hotaru','Kaoru',
            'Midori','Natsuki','Sakiko','Ayumi','Chiyo','Fumiko','Harumi','Junko',
            'Kumiko','Masako','Noriko','Reiko','Satomi','Tomoko','Wakana','Yoshiko',
            'Aoi','Akari','Aya','Chiaki','Emi','Kaori','Kira','Kokoro','Kotone',
            'Mai','Mami','Megumi','Momoko','Nanami','Riko','Rina','Saya','Shinobu',
            'Suzume','Yui','Yuka','Yuzuki','Himari','Ichika','Miu','Sakurako'
        ]
    },

    // --------------------------------------------------------
    //  ANGLO
    // --------------------------------------------------------
    anglo: {
        masc: [
            'Jimmy','Tommy','Andy','Charlie','Bobby','Danny','Eddie','Freddy',
            'Harry','Jack','Jake','James','John','Kevin','Luke','Mark','Mike',
            'Nick','Paul','Peter','Rick','Rob','Sam','Steve','Tim','Tom','Will',
            'Oliver','Noah','Liam','Ethan','Mason','Logan','Jacob','William',
            'Henry','Alexander','Benjamin','Daniel','Matthew','Joseph','David',
            'Jackson','Sebastian','Aiden','Owen','Samuel','Ryan','Nathan','Caleb',
            'Christian','Hunter','Jonathan','Aaron','Thomas','Charles','Christopher',
            'Andrew','Joshua','Adam','Dylan','Eric','Frank','Gary','Gregory','Ian',
            'Jeremy','Justin','Keith','Larry','Nathaniel','Patrick','Randy',
            'Scott','Shawn','Tyler','Victor','Walter','Zachary','Austin','Blake'
        ],
        fem: [
            'Cassie','Rosie','Maggie','Ellie','Katie','Lily','Lucy','Molly',
            'Nancy','Penny','Polly','Sally','Sophie','Annie','Betty','Daisy',
            'Emily','Grace','Hannah','Isabel','Jane','Kelly','Laura','Megan',
            'Mia','Ava','Emma','Olivia','Sophia','Chloe','Zoe','Ruby','Ivy',
            'Ella','Charlotte','Amelia','Harper','Evelyn','Abigail','Scarlett',
            'Victoria','Madison','Luna','Penelope','Riley','Layla','Lillian',
            'Nora','Hazel','Violet','Aurora','Savannah','Audrey','Brooklyn',
            'Bella','Claire','Skylar','Paisley','Everly','Anna','Caroline',
            'Kennedy','Sarah','Alice','Eva','Naomi','Stella','Natalie','Julia'
        ]
    },

    // --------------------------------------------------------
    //  FANTASÍA
    // --------------------------------------------------------
    fantasia: {
        masc: [
            'Aelin','Aelric','Bran','Cass','Dorian','Fen','Garrick','Hale',
            'Jax','Kael','Nox','Orion','Pax','Quinn','Raven','Sable','Thane',
            'Ulric','Vesper','Wren','Xander','Zephyr','Alric','Briar','Cedric',
            'Draven','Faelan','Gideon','Harlow','Imre','Jarek','Kiran','Lorcan',
            'Peregrine','Rowan','Tarian','Vanya','Ashlin','Edric','Joran',
            'Kaelen','Faelar','Thalion','Vaelor','Kaelan','Ardan','Caelan',
            'Lucan','Roan','Sylas','Theron','Castor','Damon','Evander','Fenris',
            'Grendel','Haldir','Isildur','Kaldur','Leoric','Mordred','Nero',
            'Oberon','Perseus','Tristan','Uther','Valen','Wystan','Zorander'
        ],
        fem: [
            'Elara','Iris','Lyra','Mira','Yara','Maeve','Niamh','Orla',
            'Seraphina','Cassia','Gwyn','Isolde','Aelin','Ashlin','Briar',
            'Caelia','Dara','Elowen','Faelyn','Gwen','Hala','Ilaria','Juno',
            'Kira','Liora','Maren','Nyx','Ophelia','Petra','Quinn','Rhea',
            'Sera','Tessa','Una','Vespera','Wynne','Xena','Yvaine','Zara',
            'Aeliana','Aeris','Calista','Delphine','Eluned','Freya','Galadriel',
            'Helia','Ilyana','Kaia','Luna','Maelis','Nerys','Oona','Persephone',
            'Rowena','Selene','Theia','Uma','Vala','Wren','Yael','Zinnia',
            'Arielle','Bellatrix','Celestine','Dahlia','Evanthe','Fiora'
        ]
    }
};

// ============================================================
//  ESTADO
// ============================================================
let estiloActual = 'latino';
let generoActual = 'ambos';
let ultimoNombre = '';

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
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  ELECCIÓN DEL NOMBRE
// ============================================================
function elegirNombre(estilo, genero) {
    const banco = NOMBRES[estilo] || NOMBRES.latino;

    let lista;
    if (genero === 'masc')      lista = banco.masc;
    else if (genero === 'fem')  lista = banco.fem;
    else                        lista = [...banco.masc, ...banco.fem];

    if (!lista || lista.length === 0) return '—';

    // Evitar repetir el mismo nombre dos veces seguidas
    let nombre = lista[Math.floor(Math.random() * lista.length)];
    let intentos = 0;
    while (nombre === ultimoNombre && lista.length > 1 && intentos < 5) {
        nombre = lista[Math.floor(Math.random() * lista.length)];
        intentos++;
    }
    ultimoNombre = nombre;
    return nombre;
}

// ============================================================
//  UI
// ============================================================
function nuevoNombre() {
    const el = document.getElementById('ngNombre');
    if (!el) return;

    const nombre = elegirNombre(estiloActual, generoActual);
    el.textContent = nombre;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

function seleccionarEstilo(id) {
    if (!NOMBRES[id]) return;
    estiloActual = id;
    document.querySelectorAll('#ngEstilos .ng-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.estilo === id);
    });
    nuevoNombre();
}

function seleccionarGenero(id) {
    if (!['masc','fem','ambos'].includes(id)) return;
    generoActual = id;
    document.querySelectorAll('#ngGeneros .ng-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.genero === id);
    });
    nuevoNombre();
}

// ============================================================
//  COPIAR
// ============================================================
async function copiarNombre() {
    const el = document.getElementById('ngNombre');
    const btn = document.getElementById('ngCopyBtn');
    if (!el || !btn) return;

    const texto = el.textContent.trim();
    if (!texto || texto === '—') return;

    let exito = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
            exito = true;
        }
    } catch (e) { /* fallback */ }

    if (!exito) {
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            exito = true;
        } catch (e) { exito = false; }
    }

    if (exito) {
        btn.classList.add('ok');
        btn.innerHTML = '<i data-lucide="check"></i>';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btn.classList.remove('ok');
            btn.innerHTML = '<i data-lucide="copy"></i>';
            if (window.lucide) window.lucide.createIcons();
        }, 1400);
    }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    document.querySelectorAll('#ngEstilos .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarEstilo(btn.dataset.estilo));
    });
    document.querySelectorAll('#ngGeneros .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarGenero(btn.dataset.genero));
    });

    document.getElementById('ngBtnGenerar')?.addEventListener('click', nuevoNombre);
    document.getElementById('ngCopyBtn')?.addEventListener('click', copiarNombre);

    nuevoNombre();

    if (window.lucide) window.lucide.createIcons();
});
