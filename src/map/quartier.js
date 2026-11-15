// Étape 1 de la carte : un petit quartier décrit en grille texte.
// Vraies rues du Marais, commerces aux noms inventés.
//
// Légende du sol :
//   w  Seine (eau)     .  trottoir     =  rue
//   g  parc (herbe)    T  arbre
// Lettres majuscules : un bâtiment (toutes les cases d'une même lettre forment un seul lieu).
// Chaque ligne doit avoir la même longueur.

export const QUARTIER = {
  name: 'Le Marais',

  legend: {
    w: { ground: 'water', walk: false },
    '.': { ground: 'pave', walk: true },
    '=': { ground: 'road', walk: true },
    g: { ground: 'grass', walk: true },
    T: { ground: 'grass', walk: false, deco: 'tree' },
    o: { ground: 'grass', walk: false, deco: 'fountain' },
  },

  // Logements : rent = loyer par jour (payé chaque lundi pour la semaine), price = prix d'achat.
  // Lieux de travail : jobs = { slots: postes, wage: salaire horaire de départ }.
  buildings: {
    A: { type: 'home', name: 'Appartement rue des Rosiers', rent: 35, price: 4200 },
    B: { type: 'home', name: 'Studio rue Vieille-du-Temple', rent: 25, price: 3000 },
    D: { type: 'home', name: 'Immeuble rue de Turenne', rent: 30, price: 3600 },
    E: { type: 'home', name: 'Résidence rue Saint-Antoine', rent: 30, price: 3600 },
    F: { type: 'home', name: 'Appartement rue de Bretagne', rent: 40, price: 4800 },
    G: { type: 'home', name: 'Loft quai des Célestins', rent: 55, price: 9000 },
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
  },

  rows: [
    'wwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww',
    'gTgggTgggTgggTgggTgggT',
    '......................',
    '.AA.CC..KK.OOOO..SSS..',
    '.AA.CC..KK.OOOO..SSS..',
    '...........OOOO.......',
    '======================',
    '......................',
    '.gggg..BB..MM..DD.GGg.',
    '.goTg..BB......DD.GGg.',
    '.gggg............ggTg.',
    '======================',
    '......................',
    '.EEE.PP..RR..FF..LL...',
    '.EEE.PP..RR..FF..LL...',
    '......................',
    // Nouvelle rue au sud : boutique de mode et garage (ajoutés à la fin pour garder les sauvegardes valides)
    '======================',
    '......................',
    '.YY..VVV..gTgggg.TggT.',
    '.YY..VVV..gggggg.gggg.',
    '......................',
  ],
};
