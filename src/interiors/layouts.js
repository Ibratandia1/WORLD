// Plans des intérieurs, par type de lieu. Un plan peut avoir plusieurs étages (floors).
//
//   name        nom de l'étage (si plusieurs)
//   w, h        taille en cases          wallH   hauteur des murs du fond
//   wall        couleur des murs         floor   damier du sol par défaut
//   entrance    case de la porte (bord avant, sans muret) — seulement au rez-de-chaussée
//   winL/winR   positions des fenêtres sur le mur gauche / droit
//   zones       pièces : sol coloré, murets (sauf walls:false), portes, étiquette
//   items       mobilier : k = type (voir furniture.js), action = ce qu'on fait en le touchant
//               wall:'L'|'R' + at = objet accroché au mur ; flat = au ras du sol (tapis) ; on = posé sur un autre
//   stations    places occupées par les personnages selon leur action
//               (a = actions acceptées, 'any' = n'importe qui ; lie = allongé ; face = -1 regarde à gauche)
//               L'ordre compte : les premières places libres sont prises d'abord, tous étages confondus
//               (prio < 0 = place prise en dernier).

const S = (x, y, a, extra = {}) => ({ x, y, a, ...extra });
const desks = (list, extra = {}) => list.map(([x, y]) => ({ k: 'desk', x, y, action: 'work', ...extra }));
const chairs = (list, extra = {}) => list.map(([x, y]) => ({ k: 'chair', x, y, ...extra }));

// Étages d'un plan (un plan simple = un seul étage)
export const floorsOf = L => (L.floors ? L.floors : [L]);

const OFFICE_BASE = { w: 14, h: 10, wallH: 92, wall: 0xf4ead6, floor: [0xf3e7cf, 0xe9dbbf], winL: [2, 8], winR: [1, 3, 9, 13] };
const OPEN_DESKS = [[1, 1], [3, 1], [5, 1], [7, 1], [1, 4], [3, 4], [5, 4], [7, 4]];

export const LAYOUTS = {
  office: {
    floors: [
      {
        ...OFFICE_BASE, name: 'Rez-de-chaussée', short: 'RDC', entrance: { x: 5, y: 9 }, winR: [1, 3, 9],
        zones: [
          { x: 9, y: 0, w: 5, h: 6, floor: [0xcaeed7, 0xbde6cc], wall: 0x3fae73, label: 'Cafétéria', icon: '☕', sub: 'en pause', doors: [[9, 4], [9, 5]] },
        ],
        items: [
          { k: 'reception', x: 3, y: 5 }, { k: 'chair', x: 3, y: 4, c: 0x7b5cf0 },
          { k: 'sofa', x: 1, y: 7, c: 0x9b7fe0 }, { k: 'tablec', x: 2, y: 8 }, { k: 'rug', x: 5, y: 7, flat: true, c: 0xc9b8f2, w: 2, d: 1.4 },
          { k: 'elevator', wall: 'R', at: 6 }, { k: 'stairs_up', x: 7, y: 1 }, { k: 'frame', wall: 'L', at: 4, c: 0xf2c94c },
          { k: 'bigplant', x: 0, y: 0 }, { k: 'plant', x: 8, y: 9 }, { k: 'bigplant', x: 0, y: 9 }, { k: 'plant', x: 4, y: 0 },
          { k: 'counter', x: 13, y: 1 }, { k: 'counter', x: 13, y: 2 }, { k: 'coffee', x: 13, y: 1, on: true },
          { k: 'vending', x: 12, y: 0 }, { k: 'tablec', x: 10, y: 2 }, { k: 'tablec', x: 11, y: 4 },
          { k: 'stool', x: 11, y: 2 }, { k: 'stool', x: 10, y: 4 }, { k: 'stool', x: 12, y: 4 }, { k: 'plant', x: 13, y: 5 },
        ],
        stations: [
          S(11, 2, ['any'], { face: -1, seat: true }), S(10, 4, ['any'], { seat: true }), S(12, 4, ['any'], { face: -1, seat: true }), S(1, 7, ['any'], { seat: true }),
          S(3, 4, ['work'], { prio: -1, pose: 'sit' }), // l'accueil : pris en dernier
        ],
      },
      {
        ...OFFICE_BASE, name: '1er étage', short: '1',
        zones: [
          { x: 0, y: 0, w: 10, h: 7, floor: [0xf8cdb6, 0xf2c0a6], wall: 0xe07a55, label: 'Open space', icon: '💻', sub: 'au poste', doors: [[4, 6], [5, 6]] },
        ],
        items: [
          ...desks(OPEN_DESKS),
          ...chairs(OPEN_DESKS.map(([x, y]) => [x, y + 1]), { action: 'work' }),
          { k: 'whiteboard', wall: 'R', at: 4 }, { k: 'printer', x: 9, y: 3 }, { k: 'bigplant', x: 9, y: 0 }, { k: 'plant', x: 0, y: 6 },
          { k: 'elevator', wall: 'R', at: 11 }, { k: 'stairs_up', x: 13, y: 1 }, { k: 'cooler', x: 12, y: 6 },
          { k: 'sofa', x: 11, y: 8, c: 0xe07a55 }, { k: 'rug', x: 11, y: 7, flat: true, c: 0xf2c94c, w: 1.6, d: 1 },
          { k: 'bigplant', x: 13, y: 9 }, { k: 'plant', x: 9, y: 9 }, { k: 'frame', wall: 'L', at: 8, c: 0x5b8def },
        ],
        // au bureau : assis devant l'écran, vu de dos, en train de taper
        stations: OPEN_DESKS.map(([x, y]) => S(x, y + 1, ['work'], { pose: 'type' })).concat([S(11, 8, ['any'], { seat: true })]),
      },
      {
        ...OFFICE_BASE, name: '2e étage', short: '2',
        zones: [
          { x: 0, y: 0, w: 7, h: 5, floor: [0xc9d2f7, 0xbdc7f2], wall: 0x6273d9, label: 'Réunion', icon: '📊', sub: 'en réunion', doors: [[3, 4]] },
          { x: 8, y: 0, w: 6, h: 5, floor: [0xddd1f4, 0xd2c4ef], wall: 0x9b7fe0, label: 'Direction', icon: '👔', sub: '', doors: [[8, 3]] },
        ],
        items: [
          { k: 'meeting', x: 3, y: 2, action: 'work' }, ...chairs([[2, 1], [4, 1], [2, 3], [4, 3]], { c: 0x6273d9 }),
          { k: 'whiteboard', wall: 'R', at: 3 }, { k: 'plant', x: 6, y: 0 }, { k: 'plant', x: 0, y: 4 },
          { k: 'bossdesk', x: 11, y: 2, action: 'work' }, { k: 'armchair', x: 11, y: 1 }, { k: 'bookshelf', x: 13, y: 0 },
          { k: 'armchair', x: 10, y: 4, c: 0x9b7fe0 }, { k: 'bigplant', x: 13, y: 4 }, { k: 'frame', wall: 'R', at: 9, c: 0xe86a8c },
          { k: 'elevator', wall: 'L', at: 7 }, { k: 'sofa', x: 4, y: 8, c: 0x6273d9 }, { k: 'rug', x: 4, y: 7, flat: true, c: 0xb9a4ec, w: 2, d: 1.2 },
          { k: 'tablec', x: 6, y: 7 }, { k: 'bigplant', x: 0, y: 9 }, { k: 'plant', x: 13, y: 9 }, { k: 'printer', x: 10, y: 9 },
        ],
        stations: [
          S(2, 1, ['work', 'any'], { pose: 'sit', seat: true }), S(4, 1, ['work', 'any'], { face: -1, pose: 'sit', seat: true }),
          S(2, 3, ['work', 'any'], { pose: 'sit', seat: true }), S(4, 3, ['work', 'any'], { face: -1, pose: 'sit', seat: true }),
          S(11, 1, ['work'], { pose: 'sit' }), S(4, 8, ['any'], { seat: true }),
        ],
      },
    ],
  },

  cafe: {
    w: 10, h: 8, wallH: 82, wall: 0xf6e3cf, floor: [0xe6c49a, 0xdab68a], entrance: { x: 6, y: 7 },
    winL: [3, 5], winR: [8],
    zones: [
      { x: 0, y: 0, w: 6, h: 2, floor: [0xe9e2d8, 0xddd4c8], walls: false, wall: 0xd8504d, label: 'Comptoir', icon: '☕', sub: 'au service' },
    ],
    items: [
      ...[0, 1, 2, 3, 4, 5].map(x => ({ k: 'counter', x, y: 1, action: 'coffee' })),
      { k: 'coffee', x: 1, y: 1, on: true }, { k: 'coffee', x: 4, y: 1, on: true },
      { k: 'register', x: 3, y: 1, on: true }, { k: 'cakes', x: 5, y: 1, on: true },
      { k: 'cupshelf', wall: 'R', at: 1.5 }, { k: 'menu', wall: 'R', at: 4 }, { k: 'clock', wall: 'R', at: 6.5 },
      { k: 'frame', wall: 'L', at: 7, c: 0xe86a8c },
      ...[[1, 4], [4, 4], [7, 3], [1, 6], [4, 6], [8, 5]].map(([x, y]) => ({ k: 'tablec', x, y, action: 'eat_cafe', actions: ['eat_cafe', 'coffee'], name: 'Table' })),
      ...[[2, 4], [5, 4], [8, 3], [2, 6], [5, 6], [9, 5]].map(([x, y]) => ({ k: 'stool', x, y, action: 'coffee' })),
      { k: 'bigplant', x: 9, y: 0 }, { k: 'plant', x: 0, y: 7 }, { k: 'plant', x: 9, y: 7 },
    ],
    stations: [
      S(1, 0, ['work']), S(3, 0, ['work']), S(5, 0, ['work']),
      ...[[2, 4], [5, 4], [8, 3], [2, 6], [5, 6], [9, 5]].map(([x, y]) => S(x, y, ['coffee', 'eat_cafe', 'any'], { face: -1, seat: true, table: [x - 1, y] })),
    ],
  },

  bakery: {
    w: 9, h: 7, wallH: 80, wall: 0xfff1dc, floor: [0xf1e3c6, 0xe7d6b5], entrance: { x: 4, y: 6 },
    winL: [4], winR: [],
    zones: [
      { x: 5, y: 0, w: 4, h: 3, floor: [0xe2dcd2, 0xd7d0c4], wall: 0xe5a33a, label: 'Fournil', icon: '🔥', sub: 'au four', doors: [[5, 2]] },
    ],
    items: [
      ...[1, 2, 3].map(x => ({ k: 'breadshelf', x, y: 0 })),
      ...[1, 2, 3].map(x => ({ k: 'display', x, y: 2, action: 'eat_bakery' })),
      { k: 'counter', x: 4, y: 2, action: 'eat_bakery' }, { k: 'register', x: 4, y: 2, on: true },
      { k: 'oven', x: 7, y: 0 }, { k: 'oven', x: 8, y: 0 }, { k: 'worktable', x: 6, y: 1 }, { k: 'sacks', x: 8, y: 2 },
      { k: 'bench', x: 0, y: 4 }, { k: 'plant', x: 0, y: 6 }, { k: 'plant', x: 8, y: 6 }, { k: 'frame', wall: 'L', at: 2, c: 0xe8b04a },
    ],
    stations: [
      S(2, 1, ['work']), S(7, 1, ['work'], { face: -1, pose: 'cook' }), S(6, 2, ['work'], { pose: 'cook' }),
      S(1, 3, ['eat_bakery', 'any']), S(2, 3, ['eat_bakery', 'any']), S(3, 3, ['eat_bakery', 'any']), S(4, 3, ['eat_bakery', 'any']),
      S(0, 4, ['any']),
    ],
  },

  shop: {
    w: 10, h: 8, wallH: 82, wall: 0xf2f7f0, floor: [0xeef1f4, 0xe2e6ea], entrance: { x: 5, y: 7 },
    winL: [5], winR: [2, 4],
    zones: [
      { x: 6, y: 4, w: 4, h: 3, floor: [0xd6efe0, 0xc9e8d6], walls: false, wall: 0x3fae73, label: 'Caisse', icon: '🧾', sub: 'en caisse' },
    ],
    items: [
      ...[1, 2, 3, 4, 5].flatMap(x => [{ k: 'shelf', x, y: 2, action: 'groceries' }, { k: 'shelf', x, y: 4, action: 'groceries' }]),
      ...[6, 7, 8].map(x => ({ k: 'fridgeglass', x, y: 0, action: 'groceries' })),
      { k: 'counter', x: 7, y: 5, action: 'scratch' }, { k: 'counter', x: 8, y: 5, action: 'scratch' }, { k: 'register', x: 8, y: 5, on: true },
      { k: 'frame', wall: 'L', at: 1, c: 0xf2c94c }, { k: 'bigplant', x: 0, y: 7 }, { k: 'plant', x: 9, y: 7 },
    ],
    stations: [
      S(8, 4, ['work']), S(6, 1, ['work']), S(0, 1, ['work']),
      S(2, 3, ['groceries', 'any']), S(4, 3, ['groceries', 'any']), S(1, 5, ['groceries', 'any']), S(3, 5, ['groceries', 'any']),
      S(7, 6, ['scratch', 'groceries', 'any']),
    ],
  },

  home: {
    floors: [
      {
        name: 'Hall de l’immeuble', short: 'RDC',
        w: 9, h: 7, wallH: 80, wall: 0xf3ece0, floor: [0xefe9dd, 0x9aa0aa], entrance: { x: 4, y: 6 },
        winL: [5], winR: [],
        zones: [],
        items: [
          { k: 'mailboxes', wall: 'L', at: 2 }, { k: 'elevator', wall: 'R', at: 3 }, { k: 'stairs_up', x: 6, y: 1 },
          { k: 'rug', x: 4, y: 4, flat: true, c: 0xb8504d, w: 1.2, d: 2 }, { k: 'bench', x: 1, y: 4 },
          { k: 'bigplant', x: 0, y: 6 }, { k: 'plant', x: 8, y: 6 }, { k: 'plant', x: 8, y: 0 }, { k: 'frame', wall: 'R', at: 1, c: 0x8fd3a8 },
        ],
        stations: [],
      },
      {
        name: 'Appartement · 3e', short: '3',
        w: 9, h: 7, wallH: 80, wall: 0xf7efe2, floor: [0xe9dcc6, 0xdfd0b6],
        winL: [1, 5], winR: [1],
        zones: [
          { x: 0, y: 0, w: 4, h: 3, floor: [0xddd1f4, 0xd2c4ef], wall: 0x9b7fe0, label: 'Chambre', icon: '🛏️', sub: '', doors: [[2, 2]] },
          { x: 5, y: 0, w: 4, h: 4, floor: [0xf5e4c8, 0xedd8b6], wall: 0xe5a33a, label: 'Salon', icon: '🛋️', sub: '', doors: [[5, 3]] },
          { x: 0, y: 4, w: 4, h: 3, floor: [0xdcefe6, 0xcfe7dc], wall: 0x3fae73, label: 'Cuisine', icon: '🍳', sub: '', doors: [[2, 4]] },
        ],
        items: [
          { k: 'bed', x: 1, y: 0, action: 'sleep', actions: ['sleep', 'nap'], name: 'Lit' }, { k: 'nightstand', x: 0, y: 0, actions: ['read_book'], name: 'Table de nuit' }, { k: 'wardrobe', x: 3, y: 0 },
          { k: 'rug', x: 1, y: 2, flat: true, c: 0xb9a4ec, w: 1.4, d: 0.9 }, { k: 'plant', x: 0, y: 2 },
          { k: 'tv', wall: 'R', at: 7 }, { k: 'tvstand', x: 7, y: 0, actions: ['watch_tv'], name: 'Télé' }, { k: 'rug', x: 7, y: 1, flat: true, c: 0xf08a3c, w: 1.6, d: 1 },
          { k: 'sofa', x: 7, y: 2, action: 'nap', actions: ['watch_tv', 'nap', 'read_book'], name: 'Canapé', c: 0x7b5cf0 }, { k: 'bookshelf', x: 5, y: 0, actions: ['read_book'], name: 'Bibliothèque' }, { k: 'plant', x: 8, y: 3 },
          { k: 'fridge', x: 0, y: 4, action: 'eat_home', name: 'Frigo' }, { k: 'kitchen', x: 0, y: 5, action: 'eat_home', name: 'Cuisine' }, { k: 'kitchen', x: 0, y: 6, stove: true, action: 'eat_home', name: 'Cuisinière' },
          { k: 'tableh', x: 2, y: 5, action: 'eat_home' }, { k: 'chair', x: 3, y: 5, c: 0xb98458 }, { k: 'chair', x: 2, y: 6, c: 0xb98458 },
          { k: 'frame', wall: 'L', at: 3, c: 0x5b8def }, { k: 'plant', x: 8, y: 6 }, { k: 'stairs_up', x: 6, y: 6 },
        ],
        stations: [
          S(1, 0, ['sleep'], { lie: true }),
          // canapé face à la télé : on s'y assoit (de dos pour la télé), on y lit, on y fait la sieste
          S(7, 2, ['watch_tv', 'read_book', 'nap', 'any'], { seat: true, lieAngle: -60 }),
          S(1, 6, ['cook'], { face: -1 }),                       // devant la cuisinière
          S(3, 5, ['eat_home'], { face: -1, seat: true, table: [2, 5] }), // à table
          S(6, 2, ['any']), S(4, 3, ['any']), S(5, 5, ['any']),
        ],
      },
    ],
  },

  fashion: {
    w: 9, h: 7, wallH: 82, wall: 0xfbe9ef, floor: [0xf3e7e2, 0xe9dbd5], entrance: { x: 4, y: 6 },
    winL: [5], winR: [],
    zones: [
      { x: 6, y: 0, w: 3, h: 2, floor: [0xe9e2f5, 0xddd4ee], wall: 0xd94f9c, label: 'Cabines', icon: '🪞', sub: '', doors: [[6, 1]] },
    ],
    items: [
      { k: 'rack', x: 1, y: 0, action: 'shop' }, { k: 'rack', x: 3, y: 0, action: 'shop', cols: [0x2b3245, 0x5a3a28, 0x8a8f99, 0x111111, 0xf6f6f6] },
      { k: 'rack', x: 0, y: 3, action: 'shop', cols: [0xf6f6f6, 0x2b3a6b, 0xf6f6f6, 0x2b3a6b, 0xe86a8c] },
      { k: 'foldtable', x: 3, y: 3, action: 'shop' }, { k: 'foldtable', x: 5, y: 4, action: 'shop' },
      { k: 'fitting', x: 7, y: 1 }, { k: 'mirror', wall: 'R', at: 5 }, { k: 'mirror', wall: 'L', at: 2 },
      { k: 'counter', x: 7, y: 4 }, { k: 'counter', x: 8, y: 4 }, { k: 'register', x: 8, y: 4, on: true },
      { k: 'bigplant', x: 0, y: 6 }, { k: 'plant', x: 8, y: 6 }, { k: 'rug', x: 4, y: 2, flat: true, c: 0xf2b8cf, w: 1.6, d: 1 },
    ],
    stations: [
      S(8, 3, ['work'], { face: -1 }), S(2, 1, ['work']), S(4, 4, ['work']),
      S(4, 2, ['any']), S(2, 4, ['any']), S(6, 5, ['any']), S(7, 0, ['any']),
    ],
  },

  garage: {
    w: 10, h: 7, wallH: 84, wall: 0xe9ecf1, floor: [0xc9ced8, 0xbfc5d0], entrance: { x: 5, y: 6 },
    winL: [], winR: [8],
    zones: [
      { x: 0, y: 0, w: 4, h: 4, floor: [0xb0b6c2, 0xa6adba], wall: 0xf2a33a, label: 'Atelier', icon: '🔧', sub: 'au travail', doors: [[3, 3]] },
    ],
    items: [
      { k: 'carshow', x: 1, y: 1, action: 'shop', c: 0x5b8def }, { k: 'toolwall', wall: 'L', at: 1.5 }, { k: 'tires', x: 3, y: 0 },
      { k: 'workbench', x: 0, y: 3 },
      { k: 'bike', x: 5, y: 1, action: 'shop' }, { k: 'bike', x: 6, y: 1, action: 'shop', c: 0xd8504d }, { k: 'bike', x: 7, y: 1, action: 'shop', c: 0xf2c94c },
      { k: 'carshow', x: 7, y: 3, action: 'shop', c: 0xd8504d },
      { k: 'counter', x: 2, y: 5 }, { k: 'register', x: 2, y: 5, on: true }, { k: 'frame', wall: 'R', at: 5, c: 0x2f7d5b },
      { k: 'plant', x: 9, y: 6 }, { k: 'plant', x: 0, y: 6 },
    ],
    stations: [
      S(2, 3, ['work'], { pose: 'cook' }), S(2, 4, ['work'], { face: -1, pose: 'cook' }), S(6, 3, ['work']),
      S(6, 2, ['any']), S(5, 4, ['any']), S(4, 5, ['any']),
    ],
  },

  // Mairie : guichets (aide sociale), bureau de vote avec l'urne, bureau du maire, salle du conseil
  cityhall: {
    w: 13, h: 9, wallH: 96, wall: 0xf6efe0, floor: [0xe8dcc4, 0xddd0b5], entrance: { x: 6, y: 8 },
    winL: [2, 6], winR: [2, 10],
    zones: [
      { x: 0, y: 0, w: 6, h: 2, floor: [0xeae4da, 0xdfd8cc], walls: false, wall: 0x2b4ea2, label: 'Guichets', icon: '💶', sub: 'au guichet' },
      { x: 9, y: 0, w: 4, h: 4, floor: [0xd9cbe9, 0xcfbfe2], wall: 0x6273d9, label: 'Bureau du maire', icon: '🏛️', sub: '', doors: [[9, 3]] },
      { x: 0, y: 5, w: 4, h: 4, floor: [0xd7e4f5, 0xcadaf0], wall: 0x2b4ea2, label: 'Bureau de vote', icon: '🗳️', sub: '', doors: [[3, 5]] },
    ],
    items: [
      ...[0, 1, 2, 3, 4, 5].map(x => ({ k: 'counter', x, y: 1, action: 'allocation', name: 'Guichet' })),
      { k: 'register', x: 1, y: 1, on: true }, { k: 'register', x: 4, y: 1, on: true },
      { k: 'frame', wall: 'R', at: 2, c: 0x2b4ea2 }, { k: 'clock', wall: 'R', at: 4.5 },
      { k: 'flagstand', x: 6, y: 0 }, { k: 'bust', x: 7, y: 2 },
      { k: 'bossdesk', x: 11, y: 2 }, { k: 'armchair', x: 11, y: 1 },
      { k: 'bookshelf', x: 12, y: 0 }, { k: 'flagstand', x: 10, y: 0 }, { k: 'frame', wall: 'R', at: 11, c: 0xd8504d },
      { k: 'urne', x: 1, y: 7, name: 'Urne' }, { k: 'tablec', x: 2, y: 6 },
      { k: 'bench', x: 7, y: 5 }, { k: 'bench', x: 9, y: 6 }, { k: 'rug', x: 7, y: 7, flat: true, c: 0xd8504d, w: 1.2, d: 2.6 },
      { k: 'bigplant', x: 12, y: 8 }, { k: 'bigplant', x: 4, y: 8 }, { k: 'plant', x: 8, y: 0 },
    ],
    stations: [
      S(11, 1, ['work'], { pose: 'sit' }), S(1, 0, ['work']), S(4, 0, ['work']), S(3, 0, ['work'], { prio: -1 }),
      S(1, 2, ['allocation', 'any']), S(4, 2, ['allocation', 'any']), S(2, 7, ['vote', 'run_mayor', 'any']), S(1, 6, ['vote', 'any']),
      S(7, 5, ['any'], { seat: true }), S(9, 6, ['any'], { seat: true }),
    ],
  },

  // ---------- Services publics ----------
  police: {
    w: 11, h: 8, wallH: 88, wall: 0xe8edf5, floor: [0xd5dbe6, 0xcbd2df], entrance: { x: 5, y: 7 },
    winL: [2, 5], winR: [2, 8],
    zones: [
      { x: 0, y: 0, w: 5, h: 3, floor: [0xdfe6f2, 0xd3dcec], walls: false, wall: 0x2b4ea2, label: 'Accueil', icon: '👮', sub: 'au guichet' },
      { x: 7, y: 0, w: 4, h: 4, floor: [0xbfc4cc, 0xb3b9c2], wall: 0x5f6066, label: 'Cellule', icon: '🔒', sub: '', doors: [[7, 3]] },
    ],
    items: [
      ...[0, 1, 2, 3, 4].map(x => ({ k: 'counter', x, y: 1, action: 'report', name: 'Guichet' })), { k: 'register', x: 2, y: 1, on: true },
      { k: 'frame', wall: 'R', at: 2, c: 0x2b4ea2 }, { k: 'clock', wall: 'R', at: 4.5 }, { k: 'flagstand', x: 5, y: 0 },
      { k: 'desk', x: 2, y: 4 }, { k: 'chair', x: 2, y: 5 }, { k: 'desk', x: 4, y: 4 }, { k: 'chair', x: 4, y: 5 },
      { k: 'bench', x: 9, y: 2 }, { k: 'bench', x: 0, y: 6 }, { k: 'bench', x: 9, y: 6 }, { k: 'plant', x: 10, y: 7 }, { k: 'cooler', x: 6, y: 0 },
    ],
    stations: [S(1, 0, ['work']), S(3, 0, ['work']), S(2, 5, ['work'], { pose: 'type' }), S(4, 5, ['work'], { pose: 'type' }),
      S(2, 2, ['report', 'any']), S(9, 2, ['jail'], { seat: true }), S(8, 1, ['jail']), S(10, 1, ['jail']), S(0, 6, ['any'], { seat: true })],
  },

  // Tribunal : salle d'audience (estrade du juge, banc des jurés, barre, public), greffe
  court: {
    w: 13, h: 9, wallH: 100, wall: 0xf1ece2, floor: [0xcdb592, 0xc2a984], entrance: { x: 6, y: 8 },
    winL: [2, 6], winR: [2, 10],
    zones: [
      { x: 0, y: 0, w: 9, h: 6, floor: [0xb98a5e, 0xae7f54], walls: false, wall: 0x4a5266, label: 'Salle d’audience', icon: '⚖️', sub: 'audience publique' },
      { x: 10, y: 0, w: 3, h: 4, floor: [0xdbe4ef, 0xcfdae8], wall: 0x4a5266, label: 'Greffe', icon: '📜', sub: '', doors: [[10, 3]] },
    ],
    items: [
      { k: 'judgebench', x: 4, y: 0, action: 'attend_trial', name: 'Estrade du juge' }, { k: 'armchair', x: 4, y: 1, c: 0x7a2a2a },
      { k: 'flagstand', x: 2, y: 0 }, { k: 'flagstand', x: 6, y: 0 }, { k: 'bust', x: 8, y: 0 },
      { k: 'frame', wall: 'R', at: 4, c: 0x2b4ea2 }, { k: 'clock', wall: 'R', at: 7 },
      { k: 'bench', x: 0, y: 2, name: 'Banc des jurés' }, { k: 'bench', x: 0, y: 3, name: 'Banc des jurés' },
      { k: 'bar', x: 4, y: 3, action: 'attend_trial', name: 'Barre' },
      { k: 'desk', x: 7, y: 2, action: 'legal_advice', name: 'Table de la défense' }, { k: 'chair', x: 7, y: 3 },
      ...[2, 4, 6].map(x => ({ k: 'bench', x, y: 5, action: 'attend_trial', name: 'Bancs du public' })),
      { k: 'desk', x: 11, y: 2 }, { k: 'chair', x: 11, y: 1 }, { k: 'bookshelf', x: 12, y: 0 }, { k: 'bookshelf', x: 11, y: 0 },
      { k: 'bigplant', x: 12, y: 8 }, { k: 'bigplant', x: 0, y: 8 }, { k: 'bin', x: 9, y: 8 },
    ],
    stations: [
      S(4, 1, ['work'], { pose: 'sit' }), S(7, 3, ['work', 'legal_advice'], { seat: true }), S(11, 1, ['work'], { pose: 'type', seat: true }), S(5, 3, ['work']),
      S(0, 2, ['any'], { seat: true }), S(0, 3, ['any'], { seat: true }),
      ...[2, 4, 6].map(x => S(x, 5, ['attend_trial', 'any'], { seat: true })), S(3, 3, ['legal_advice', 'any']),
    ],
  },

  // Banque : guichets vitrés, coffre-fort, bureau du conseiller (prêts), distributeur
  bank: {
    w: 12, h: 8, wallH: 96, wall: 0xf3eee2, floor: [0xe7e0d0, 0xddd4c0], entrance: { x: 5, y: 7 },
    winL: [2, 5], winR: [2, 8],
    zones: [
      { x: 0, y: 0, w: 6, h: 2, floor: [0xe9efe9, 0xdfe8df], walls: false, wall: 0x2f5d4a, label: 'Guichets', icon: '🏦', sub: 'dépôts et retraits' },
      { x: 8, y: 0, w: 4, h: 4, floor: [0xd8e6dc, 0xcbdccf], wall: 0x2f5d4a, label: 'Conseiller', icon: '📝', sub: 'prêts', doors: [[8, 3]] },
      { x: 0, y: 4, w: 3, h: 4, floor: [0xbfc4cc, 0xb3b9c2], wall: 0x5f6066, label: 'Salle des coffres', icon: '🔐', sub: '', doors: [[2, 4]] },
    ],
    items: [
      ...[0, 1, 2, 3, 4, 5].map(x => ({ k: 'glasscounter', x, y: 1, action: x % 2 ? 'withdraw' : 'deposit', name: 'Guichet' })),
      { k: 'register', x: 1, y: 1, on: true }, { k: 'register', x: 4, y: 1, on: true },
      { k: 'frame', wall: 'R', at: 2.5, c: 0xd9b04c }, { k: 'clock', wall: 'R', at: 5 },
      { k: 'bossdesk', x: 10, y: 2, action: 'take_loan', name: 'Bureau du conseiller' }, { k: 'chair', x: 10, y: 3 }, { k: 'armchair', x: 10, y: 1 },
      { k: 'bookshelf', x: 11, y: 0 }, { k: 'plant', x: 9, y: 0 },
      { k: 'safe', x: 0, y: 5, action: 'deposit', name: 'Coffre-fort' }, { k: 'safe', x: 1, y: 7 },
      { k: 'atm', x: 7, y: 6, action: 'withdraw', name: 'Distributeur' },
      { k: 'bench', x: 5, y: 4 }, { k: 'bench', x: 7, y: 4 }, { k: 'rug', x: 5, y: 5.5, flat: true, c: 0x2f5d4a, w: 1.2, d: 2.4 },
      { k: 'bigplant', x: 11, y: 7 }, { k: 'plant', x: 3, y: 7 }, { k: 'bin', x: 9, y: 7 },
    ],
    stations: [
      S(1, 0, ['work']), S(4, 0, ['work']), S(10, 1, ['work'], { pose: 'sit' }), S(3, 0, ['work'], { prio: -1 }),
      S(1, 2, ['deposit', 'withdraw', 'any']), S(4, 2, ['deposit', 'withdraw', 'any']), S(10, 3, ['take_loan', 'repay_loan'], { seat: true }),
      S(7, 7, ['withdraw', 'any']), S(5, 4, ['any'], { seat: true }), S(7, 4, ['any'], { seat: true }),
    ],
  },

  hospital: {
    w: 13, h: 9, wallH: 96, wall: 0xf3f6fa, floor: [0xe6edf3, 0xdde6ee], entrance: { x: 6, y: 8 },
    winL: [2, 6], winR: [2, 10],
    zones: [
      { x: 0, y: 0, w: 5, h: 2, floor: [0xe9f4ef, 0xddefe6], walls: false, wall: 0x3fae73, label: 'Accueil', icon: '🏥', sub: 'à l’accueil' },
      { x: 7, y: 0, w: 6, h: 5, floor: [0xdbe8f7, 0xcfe0f3], wall: 0x5b8def, label: 'Chambres', icon: '🛏️', sub: 'patients', doors: [[7, 4]] },
      { x: 0, y: 5, w: 4, h: 4, floor: [0xf7e6e6, 0xf2dada], wall: 0xd8504d, label: 'Consultation', icon: '🩺', sub: '', doors: [[3, 5]] },
    ],
    items: [
      ...[0, 1, 2, 3].map(x => ({ k: 'counter', x, y: 1, action: 'consult', name: 'Accueil' })), { k: 'register', x: 1, y: 1, on: true },
      { k: 'bed', x: 8, y: 1, c: 0xffffff, action: 'consult' }, { k: 'bed', x: 10, y: 1, c: 0xffffff, action: 'consult' }, { k: 'bed', x: 12, y: 1, c: 0xffffff, action: 'consult' },
      { k: 'nightstand', x: 9, y: 0 }, { k: 'nightstand', x: 11, y: 0 },
      { k: 'desk', x: 1, y: 7, action: 'consult' }, { k: 'chair', x: 1, y: 6 }, { k: 'bench', x: 5, y: 3 }, { k: 'bench', x: 5, y: 5 },
      { k: 'cooler', x: 4, y: 0 }, { k: 'bigplant', x: 12, y: 8 }, { k: 'plant', x: 4, y: 8 }, { k: 'clock', wall: 'R', at: 3 },
    ],
    stations: [S(1, 0, ['work']), S(3, 0, ['work']), S(9, 2, ['work']), S(11, 2, ['work']), S(1, 6, ['work'], { pose: 'sit' }),
      S(8, 1, ['consult'], { lie: true }), S(10, 1, ['consult'], { lie: true }), S(5, 3, ['any', 'consult'], { seat: true }), S(5, 5, ['any'], { seat: true })],
  },

  firestation: {
    w: 11, h: 8, wallH: 90, wall: 0xf1e2dc, floor: [0xc9ced8, 0xbfc5d0], entrance: { x: 4, y: 7 },
    winL: [], winR: [2, 8],
    zones: [
      { x: 0, y: 0, w: 7, h: 5, floor: [0xb0b6c2, 0xa6adba], walls: false, wall: 0xd8504d, label: 'Garage', icon: '🚒', sub: 'prêts à partir' },
      { x: 8, y: 0, w: 3, h: 5, floor: [0xf2e3c9, 0xe8d6b5], wall: 0xe5a33a, label: 'Repos', icon: '☕', sub: '', doors: [[8, 3]] },
    ],
    items: [
      { k: 'carshow', x: 2, y: 2, c: 0xd8504d }, { k: 'carshow', x: 5, y: 2, c: 0xd8504d }, { k: 'toolwall', wall: 'L', at: 2 },
      { k: 'tires', x: 0, y: 0 }, { k: 'workbench', x: 6, y: 0 },
      { k: 'sofa', x: 9, y: 2, c: 0xd8504d }, { k: 'tablec', x: 9, y: 4 }, { k: 'coffee', x: 10, y: 0 }, { k: 'counter', x: 10, y: 0 },
      { k: 'plant', x: 10, y: 7 }, { k: 'plant', x: 0, y: 7 },
    ],
    stations: [S(1, 3, ['work'], { pose: 'cook' }), S(4, 3, ['work']), S(9, 2, ['work', 'any'], { seat: true }), S(7, 5, ['work']), S(5, 6, ['any'])],
  },

  prison: {
    w: 11, h: 8, wallH: 92, wall: 0xd8d6d0, floor: [0xbab8b2, 0xb0aea8], entrance: { x: 5, y: 7 },
    winL: [], winR: [],
    zones: [
      { x: 0, y: 0, w: 3, h: 4, floor: [0xa9a7a1, 0x9f9d97], wall: 0x5f6066, label: 'Cellule', icon: '🔒', sub: '', doors: [[2, 3]] },
      { x: 4, y: 0, w: 3, h: 4, floor: [0xa9a7a1, 0x9f9d97], wall: 0x5f6066, label: 'Cellule', icon: '🔒', sub: '', doors: [[4, 3]] },
      { x: 8, y: 0, w: 3, h: 4, floor: [0xa9a7a1, 0x9f9d97], wall: 0x5f6066, label: 'Cellule', icon: '🔒', sub: '', doors: [[8, 3]] },
    ],
    // Cellules avec lit, table de nuit et plante ; réfectoire, bibliothèque et coin télé : une détention digne
    items: [
      { k: 'bed', x: 0, y: 1, c: 0x5b8def }, { k: 'bed', x: 5, y: 1, c: 0x4bbf8b }, { k: 'bed', x: 9, y: 1, c: 0xf2c94c },
      { k: 'nightstand', x: 1, y: 0 }, { k: 'nightstand', x: 6, y: 0 }, { k: 'nightstand', x: 10, y: 0 },
      { k: 'desk', x: 2, y: 6 }, { k: 'chair', x: 2, y: 5 },
      { k: 'tableh', x: 7, y: 6, name: 'Réfectoire' }, { k: 'bench', x: 8, y: 6 }, { k: 'bench', x: 6, y: 6 },
      { k: 'bookshelf', x: 4, y: 7, name: 'Bibliothèque' }, { k: 'tvstand', x: 10, y: 5 }, { k: 'sofa', x: 10, y: 7, c: 0x7a6f96 },
      { k: 'cooler', x: 3, y: 4 }, { k: 'plant', x: 0, y: 7 }, { k: 'plant', x: 10, y: 4 },
    ],
    stations: [S(2, 5, ['work'], { pose: 'sit' }), S(4, 5, ['work']), S(8, 5, ['work']),
      S(0, 1, ['jail'], { lie: true }), S(5, 1, ['jail'], { lie: true }), S(9, 1, ['jail'], { lie: true }),
      S(6, 6, ['jail', 'any'], { seat: true, pose: 'eat2' }), S(8, 6, ['jail'], { seat: true, pose: 'eat2' }),
      S(4, 6, ['jail'], { pose: 'read' }), S(10, 7, ['jail', 'any'], { seat: true })],
  },

  school: {
    w: 12, h: 8, wallH: 88, wall: 0xfdf3df, floor: [0xe9d9b8, 0xdfcca6], entrance: { x: 6, y: 7 },
    winL: [2, 5], winR: [2, 6, 9],
    zones: [
      { x: 0, y: 0, w: 7, h: 5, floor: [0xf6e2c4, 0xefd6b2], wall: 0xe5a33a, label: 'Salle de classe', icon: '🎓', sub: 'en cours', doors: [[3, 4]] },
      { x: 8, y: 0, w: 4, h: 4, floor: [0xdbe8f7, 0xcfe0f3], wall: 0x5b8def, label: 'Bibliothèque', icon: '📚', sub: '', doors: [[8, 3]] },
    ],
    items: [
      { k: 'whiteboard', wall: 'R', at: 3 }, { k: 'desk', x: 3, y: 0 },
      ...[[1, 2], [3, 2], [5, 2], [1, 4], [3, 4], [5, 4]].map(([x, y]) => ({ k: 'desk', x, y, action: 'study' })),
      ...[[1, 3], [3, 3], [5, 3]].map(([x, y]) => ({ k: 'chair', x, y })),
      { k: 'bookshelf', x: 9, y: 0 }, { k: 'bookshelf', x: 11, y: 0 }, { k: 'tablec', x: 10, y: 2, action: 'study' }, { k: 'armchair', x: 10, y: 3 },
      { k: 'plant', x: 11, y: 7 }, { k: 'plant', x: 0, y: 7 }, { k: 'clock', wall: 'L', at: 6 },
    ],
    stations: [S(3, 1, ['work']), S(9, 2, ['work']), S(6, 6, ['work']),
      ...[[1, 3], [3, 3], [5, 3]].map(([x, y]) => S(x, y, ['study', 'any'], { pose: 'type', seat: true })), S(10, 3, ['study', 'any'], { pose: 'read', seat: true })],
  },

  metro: {
    w: 8, h: 6, wallH: 76, wall: 0xeef3ef, floor: [0xd5d8de, 0xcbced6], entrance: { x: 2, y: 5 },
    winL: [], winR: [],
    zones: [
      { x: 4, y: 0, w: 4, h: 3, floor: [0x9aa0aa, 0x8f95a0], walls: false, wall: 0x2f7d5b, label: 'Quais', icon: '🚧', note: 'Bientôt' },
    ],
    items: [
      { k: 'metrosign', wall: 'R', at: 2 }, { k: 'ticket', x: 1, y: 0, action: 'metro' }, { k: 'ticket', x: 2, y: 0, action: 'metro' },
      { k: 'gate', x: 4, y: 3, action: 'metro' }, { k: 'gate', x: 5, y: 3, action: 'metro' }, { k: 'gate', x: 6, y: 3, action: 'metro' },
      { k: 'stairs', x: 6, y: 1, flat: true }, { k: 'bench', x: 0, y: 3, action: 'sleep_rough' }, { k: 'frame', wall: 'L', at: 2, c: 0x9fe3c2 }, { k: 'plant', x: 0, y: 5 },
    ],
    stations: [S(0, 3, ['sleep_rough'], { lie: true }), S(1, 1, ['any']), S(2, 2, ['any']), S(1, 4, ['any'])],
  },
};
