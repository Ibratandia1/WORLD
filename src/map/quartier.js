// Étape 1 de la carte : le quartier décrit en grille texte.
// Vraies rues du Marais (tracé organique : coudes, baïonnettes, ruelles, places), commerces aux noms inventés.
//
// Légende du sol :
//   w  Seine (eau)     .  trottoir     =  rue (voitures)     :  ruelle / place pavée (piétons)
//   #  rue principale  a  trottoir avec arbre d'alignement
//   g  herbe           T  arbre        o  fontaine         x  statue        X  immeuble de décor
// Lettres majuscules : un bâtiment (toutes les cases d'une même lettre forment un seul lieu).
// Chaque ligne doit avoir la même longueur.
//
// ⚠ `order` fixe l'identifiant des bâtiments (les sauvegardes s'en servent) : toujours AJOUTER les nouvelles lettres à la fin.

export const QUARTIER = {
  name: 'Le Marais',
  layout: 4, // version du tracé : quand elle change, les sauvegardes replacent les passants sur le nouveau plan
  // Tracé 4 : quadrillage de rues droites ; la rue principale (#, rang 13) traverse le centre-ville,
  // bordée d'arbres d'alignement (a) et des commerces (cafés, boulangeries, banque, supérette, brasserie).

  order: 'ACKOSBMDGEPRFLYV' + 'HNUIJQ' + 'Z' + '12345' + '67' + 'bcdfilqrstuvmnyz',

  // Lieux des fêtes du quartier (centre de la place)
  places: {
    marche: { x: 18, y: 17, name: 'place du Marché' },
    vosges: { x: 31, y: 17, name: 'place des Vosges' },
    parc: { x: 17, y: 39, name: 'parc des Glycines' },
  },

  legend: {
    w: { ground: 'water', walk: false },
    '.': { ground: 'pave', walk: true },
    '=': { ground: 'road', walk: true },
    '#': { ground: 'road', walk: true, avenue: true },  // rue principale du centre-ville
    a: { ground: 'pave', walk: true, deco: 'avtree' },  // trottoir avec un arbre d'alignement (côté rue)
    ':': { ground: 'cobble', walk: true },
    g: { ground: 'grass', walk: true },
    T: { ground: 'grass', walk: false, deco: 'tree' },
    o: { ground: 'grass', walk: false, deco: 'fountain' },
    x: { ground: 'cobble', walk: false, deco: 'statue' }, // statue de Marianne, devant la mairie
    X: { ground: 'pave', walk: false, deco: 'filler' },   // immeuble de décor (habité, mais on n'y entre pas) : la ville est dense
    // --- Les Jardins (quartier résidentiel) ---
    j: { ground: 'grass', walk: false, deco: 'garden' },   // jardin privé d'une maison (haie côté rue, fleurs)
    p: { ground: 'gravel', walk: true },                    // allée de gravier du parc
    e: { ground: 'pond', walk: false, deco: 'pond' },      // étang du parc (canards)
    k: { ground: 'grass', walk: false, deco: 'playground' }, // aire de jeux (balançoire, toboggan)
  },

  // Logements : rent = loyer par jour (payé chaque lundi pour la semaine), price = prix d'achat,
  //             units = nombre d'appartements (locataires possibles).
  // Lieux de travail : jobs = { slots: postes, wage: salaire horaire de départ }.
  buildings: {
    A: { type: 'home', name: 'Appartement rue des Rosiers', rent: 35, price: 4200, units: 2 },
    B: { type: 'home', name: 'Studio rue Vieille-du-Temple', rent: 25, price: 3000, units: 8 },
    D: { type: 'home', name: 'Immeuble rue de Turenne', rent: 30, price: 3600, units: 8 },
    E: { type: 'home', name: 'Résidence rue Saint-Antoine', rent: 30, price: 3600, units: 8 },
    F: { type: 'home', name: 'Appartement rue de Bretagne', rent: 40, price: 4800, units: 8 },
    G: { type: 'home', name: 'Loft quai des Célestins', rent: 55, price: 9000, units: 1 },
    C: { type: 'cafe', name: 'Café Lumière', jobs: { slots: 3, wage: 12 } },
    R: { type: 'cafe', name: 'Le Petit Zinc', jobs: { slots: 3, wage: 12 } },
    K: { type: 'bakery', name: 'Boulangerie Dorée', jobs: { slots: 3, wage: 11 } },
    L: { type: 'bakery', name: 'Fournil des Archives', jobs: { slots: 3, wage: 11 } },
    O: { type: 'office', name: 'Néoplex Bureaux', jobs: { slots: 6, wage: 15 } },
    P: { type: 'office', name: 'Atelier Kubik', jobs: { slots: 3, wage: 19 } },
    S: { type: 'shop', name: 'Supérette Prixdoux', jobs: { slots: 3, wage: 12 } },
    M: { type: 'metro', name: 'Métro Saint-Paul' },
    Y: { type: 'fashion', name: 'Maison Plume', jobs: { slots: 3, wage: 12 } },
    V: { type: 'garage', name: 'Garage Roue Libre', jobs: { slots: 3, wage: 14 } },
    // --- Ajoutés avec le tracé organique ---
    H: { type: 'home', name: 'Immeuble rue des Francs-Bourgeois', rent: 32, price: 3900, units: 6 },
    N: { type: 'cafe', name: 'Brasserie du Marché', jobs: { slots: 3, wage: 12 } },
    U: { type: 'shop', name: 'Épicerie Sainte-Catherine', jobs: { slots: 3, wage: 12 } },
    I: { type: 'home', name: 'Studios place du Marché', rent: 22, price: 2700, units: 4 },
    J: { type: 'home', name: 'Duplex place des Vosges', rent: 70, price: 12000, units: 1 },
    Q: { type: 'home', name: 'Chambres impasse Guéménée', rent: 18, price: 2200, units: 5 },
    // --- L'État dans le quartier ---
    Z: { type: 'cityhall', name: 'Mairie du Marais', jobs: { slots: 4, wage: 15 } },
    // --- Services publics (chiffres : on n'a plus de lettres libres) ---
    // edu = niveau d'études demandé pour être embauché (cours du soir à l'école)
    1: { type: 'police', name: 'Commissariat du Marais', jobs: { slots: 4, wage: 16, edu: 1 } },
    2: { type: 'hospital', name: 'Hôpital Saint-Gervais', jobs: { slots: 6, wage: 18, edu: 2 } },
    3: { type: 'firestation', name: 'Caserne des pompiers', jobs: { slots: 4, wage: 16, edu: 1 } },
    4: { type: 'prison', name: 'Maison d’arrêt', jobs: { slots: 3, wage: 15, edu: 0 } },
    5: { type: 'school', name: 'École des Archives', jobs: { slots: 4, wage: 15, edu: 2 } },
    // --- Justice et argent ---
    6: { type: 'court', name: 'Tribunal du Marais', jobs: { slots: 6, wage: 21, edu: 3 } },
    7: { type: 'bank', name: 'Banque Pavé d’Or', jobs: { slots: 3, wage: 17, edu: 2 } },
    // --- Les Jardins : maisons avec jardin (style: 'house' = maison individuelle, 1 logement) ---
    b: { type: 'home', style: 'house', name: 'Maison allée des Tilleuls', rent: 45, price: 7500 },
    c: { type: 'home', style: 'house', name: 'Maison aux volets bleus', rent: 48, price: 7800 },
    d: { type: 'home', style: 'house', name: 'Maison du coin des Tilleuls', rent: 50, price: 8200 },
    f: { type: 'home', style: 'house', name: 'Maison rue des Lilas', rent: 44, price: 7300 },
    i: { type: 'home', style: 'house', name: 'Maison aux roses', rent: 46, price: 7600 },
    l: { type: 'home', style: 'house', name: 'Maison du coin des Lilas', rent: 50, price: 8100 },
    q: { type: 'home', style: 'house', name: 'Maison rue des Glycines', rent: 46, price: 7600 },
    r: { type: 'home', style: 'house', name: 'Maison au cerisier', rent: 48, price: 7900 },
    s: { type: 'home', style: 'house', name: 'Maison du coin des Glycines', rent: 52, price: 8500 },
    t: { type: 'home', style: 'house', name: 'Maison rue des Pivoines', rent: 44, price: 7200 },
    u: { type: 'home', style: 'house', name: 'Maison au puits', rent: 47, price: 7700 },
    v: { type: 'home', style: 'house', name: 'Maison du coin des Pivoines', rent: 50, price: 8200 },
    m: { type: 'home', style: 'house', name: 'Villa des Hortensias', rent: 85, price: 15000 },
    n: { type: 'home', style: 'house', name: 'Villa Mimosa', rent: 90, price: 16000 },
    y: { type: 'cafe', style: 'village', name: 'Café du Parc', jobs: { slots: 3, wage: 12 } },
    z: { type: 'bakery', style: 'village', name: 'Boulangerie des Jardins', jobs: { slots: 3, wage: 11 } },
  },

  rows: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwgTgg.gTggg.ggTgg..gTggTg.ggwwwww',
    'ww..................................',
    '====================================',
    '.........=................=.........',
    'XAA:333X.=.OOOOX:BBB66111.=.GG:FF555',
    'XAA:333X.=.OOOOX:BBB66111.=.GG:FF555',
    'XXX:333X.=.OOOOX:XXX66111.=.GG:XX555',
    'XXX:XXXX.=.XXXXX:XXXXX111.=.XX:XXXXX',
    'XCC:KKKX.=.7777X:SSSPPXXX.=.DD:LLXXX',
    'XCC:KKKX.=.7777X:SSSPPXXX.=.DD:LLXXX',
    '.a..a..a.=..a..a..a..a..a.=..a..a..a',
    '####################################',
    '.a..a..a.=..a..a..a..a..a.=..a..a..a',
    'XEE:RRRX.=.NNN::::::::UUU.=.TgTgTgTg',
    'XEE:RRXX.=.NNN::T:::T:UUU.=.gggggggg',
    'gTg:XXXX.=.XXX::::o:::XXX.=.ggogggTg',
    'goT:XXXX.=.MMM::T:::T:III.=.ggggggJJ',
    'ggg:XXXX.=.MMM::::::::III.=.TgTgggJJ',
    '.........=................=.........',
    '====================================',
    '.........=................=.........',
    'XYY:QQXX.=.VVV:gTgggTgXXX.=.XZZZZXXX',
    'XYY:QQXX.=.VVV:gggogggXXX.=.XZZZZXXX',
    'XXX:XXXX.=.XXX:gTgggTgXXX.=.XZZZZXXX',
    'gTg:XXXX.=.XXX::::::X4444.=.:::::::X',
    'ggT:HHHX.=.22222222XX4444.=.T::x::TX',
    'XXX:HHHX.=.22222222XX4444.=.:::::::X',
    '.........=................=.........',
    // --- Les Jardins : quartier résidentiel au sud (maisons, villas, grand parc) ---
    '====================================',
    '.........=................=.........',
    'bbjccjdd.=.TgTgggppgggTgT.=.qqjrrjss',
    'bbjccjdd.=.gggggTppTggggg.=.qqjrrjss',
    'jjjjjjjj.=.gTeeeeppggggTg.=.jjjjjjjj',
    'jTjjTjjT.=.geeeeeppgkkkgg.=.TjjTjjTj',
    'jjjjjjjj.=.gTeeeeppgkkkTg.=.jjjjjjjj',
    'ffjiijll.=.ggggggppgggggg.=.ttjuujvv',
    'ffjiijll.=.pppppppppppppp.=.ttjuujvv',
    '.........=.pppppppppppppp.=.........',
    '==========.ggggggppgggggg.==========',
    '.........=.gTgggTppTgggTg.=.........',
    'mmmjjnnn.=.gggoggppggTggg.=.yyyy:zzz',
    'mmmjjnnn.=.TgggggppggggTg.=.yyyy:zzz',
    'jjjjTjjj.=.ggTgggppgTgggg.=.::::::::',
    'jTjjjjTj.=.gggggTppgggTgg.=.gTgggTgg',
    'jjjjjjjj.=.TgTgggppggTgTg.=.gggTgggT',
    '.........=................=.........',
  ],
};
