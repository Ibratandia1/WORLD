// Étape 1 de la carte : le quartier décrit en grille texte.
// Vraies rues du Marais (tracé organique : coudes, baïonnettes, ruelles, places), commerces aux noms inventés.
//
// Légende du sol :
//   w  Seine (eau)     .  trottoir     =  rue (voitures)     :  ruelle / place pavée (piétons)
//   g  herbe           T  arbre        o  fontaine
// Lettres majuscules : un bâtiment (toutes les cases d'une même lettre forment un seul lieu).
// Chaque ligne doit avoir la même longueur.
//
// ⚠ `order` fixe l'identifiant des bâtiments (les sauvegardes s'en servent) : toujours AJOUTER les nouvelles lettres à la fin.

export const QUARTIER = {
  name: 'Le Marais',
  layout: 2, // version du tracé : quand elle change, les sauvegardes replacent les passants sur le nouveau plan

  order: 'ACKOSBMDGEPRFLYV' + 'HNUIJQ',

  legend: {
    w: { ground: 'water', walk: false },
    '.': { ground: 'pave', walk: true },
    '=': { ground: 'road', walk: true },
    ':': { ground: 'cobble', walk: true },
    g: { ground: 'grass', walk: true },
    T: { ground: 'grass', walk: false, deco: 'tree' },
    o: { ground: 'grass', walk: false, deco: 'fountain' },
  },

  // Logements : rent = loyer par jour (payé chaque lundi pour la semaine), price = prix d'achat,
  //             units = nombre d'appartements (locataires possibles).
  // Lieux de travail : jobs = { slots: postes, wage: salaire horaire de départ }.
  buildings: {
    A: { type: 'home', name: 'Appartement rue des Rosiers', rent: 35, price: 4200, units: 2 },
    B: { type: 'home', name: 'Studio rue Vieille-du-Temple', rent: 25, price: 3000, units: 6 },
    D: { type: 'home', name: 'Immeuble rue de Turenne', rent: 30, price: 3600, units: 6 },
    E: { type: 'home', name: 'Résidence rue Saint-Antoine', rent: 30, price: 3600, units: 6 },
    F: { type: 'home', name: 'Appartement rue de Bretagne', rent: 40, price: 4800, units: 6 },
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
    H: { type: 'home', name: 'Immeuble rue des Francs-Bourgeois', rent: 32, price: 3900, units: 4 },
    N: { type: 'cafe', name: 'Brasserie du Marché', jobs: { slots: 3, wage: 12 } },
    U: { type: 'shop', name: 'Épicerie Sainte-Catherine', jobs: { slots: 3, wage: 12 } },
    I: { type: 'home', name: 'Studios place du Marché', rent: 22, price: 2700, units: 4 },
    J: { type: 'home', name: 'Duplex place des Vosges', rent: 70, price: 12000, units: 1 },
    Q: { type: 'home', name: 'Chambres impasse Guéménée', rent: 18, price: 2200, units: 5 },
  },

  rows: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwgTgg.gTggg.ggTgg..gTggTg.ggwwwww',
    'ww..................................',
    '=====================...............',
    '.........=..........================',
    '.AA.:CC..=.OOOO.:BB.......=.........',
    '.AA.:CC..=.OOOO.:BB.SSS...=.GG..FF..',
    '.A..:....=.OOOO.:...SSS...=.GG..FF..',
    '...:..KK.=......:::.SS....=.GGG.....',
    '..:...KK.=.HHH.T..:.......=....:....',
    '.:.......=.HHH....:.PP....=.DD.:.LL.',
    '.........=........:.PP....=.DD.:.LL.',
    '===============...:.......=....:....',
    '.........=....======================',
    '.EEE.RR..=.................=........',
    '.EEE.RR..=..NN.:::::::.UU..=.TgTgTg.',
    '.E.......==.NN.:T:o:T:.UU..=.gggggg.',
    '.gggg..:..=....:::::::.....=.TgoggT.',
    '.goTg.:...=.MM.:T:::T:.II..=.gggggg.',
    '.gTgg:....=..........:.II..=.JJ.....',
    '.....:....=............=============',
    '========================...=........',
    '..........=................=.TggTg..',
    '.YY..:QQ..=.VVV.:.gTgggTg..=.gggggT.',
    '.YY..:QQ..=.VVV.:.gggogg...=........',
    '.....:....=.....:.gTgggTg..=.gTggTg.',
    '.gTg.:....=..:::::.........=........',
    '.ggT.:..T.=..:.............=........',
    '..........=................=........',
  ],
};
