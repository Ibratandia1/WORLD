import { shade } from './color.js';

// Apparence des personnages (joueur et PNJ) : dessin pixel art 16 x 28.
export const LOOK_OPTIONS = {
  skin: [0xf6d7c3, 0xf1c7a3, 0xd9a77e, 0xb57a52, 0x8a5634, 0x5e3a24],
  hairColor: [0x1c1410, 0x4a3020, 0x7a4a2a, 0xb5651d, 0xd9a441, 0xe8d8b0, 0xdddddd, 0xd94f9c, 0x5b8def],
  hairStyle: [['court', 'Court'], ['long', 'Long'], ['boucles', 'Boucles'], ['afro', 'Afro'], ['chignon', 'Chignon'],
    ['queue', 'Queue de cheval'], ['carre', 'Carré'], ['tresses', 'Tresses'], ['crete', 'Crête'], ['casquette', 'Casquette'], ['chauve', 'Rasé']],
  build: [['mince', 'Mince'], ['normal', 'Normale'], ['fort', 'Costaud']],
  body: [0xf2c94c, 0xe86a8c, 0x5b8def, 0x4bbf8b, 0x9b6ee8, 0xf08a3c, 0x3cb5c9, 0xffffff, 0x333a4a, 0xd8504d],
  legs: [0x3a4766, 0x2a2f3d, 0x6b4a2f, 0x8a8f99, 0x2e6b4a, 0xc9b48a],
  accessory: [['aucun', 'Aucun'], ['lunettes', 'Lunettes'], ['echarpe', 'Écharpe'], ['moustache', 'Moustache']],
  // Options de base ; le reste se débloque en boutique (voir sim/catalog.js)
  outfit: [['normal', 'Normale']],
  hat: [['aucun', 'Aucun']],
};

// Dessin de base sur 16 x 28, + 1 pixel de contour tout autour → texture 18 x 30
export const CHAR_W = 18;
export const CHAR_H = 30;
const OUTLINE = 0x2b2236;

const pick = a => a[Math.floor(Math.random() * a.length)];

export function randomLook() {
  const O = LOOK_OPTIONS;
  return {
    skin: pick(O.skin), hairColor: pick(O.hairColor), hairStyle: pick(O.hairStyle)[0],
    body: pick(O.body), legs: pick(O.legs), build: Math.random() < 0.6 ? 'normal' : pick(O.build)[0],
    accessory: Math.random() < 0.7 ? 'aucun' : pick(O.accessory.slice(1))[0],
  };
}

// Poses (façon Sims) : textures créées à la demande, clé = `${texKey}_${nom}`.
//   sit = assis · back = vu de dos · arms = position des bras / objet tenu
export const POSES = {
  sit: { sit: true },
  read: { sit: true, arms: 'book' },
  eat1: { sit: true, arms: 'eat' }, eat2: { sit: true, arms: 'fork' },
  drink1: { sit: true, arms: 'cup_up' }, drink2: { sit: true, arms: 'cup' },
  cook1: { arms: 'pan' }, cook2: { arms: 'pan2' },
  back_sit: { back: true, sit: true },
  type1: { back: true, sit: true, arms: 'type' }, type2: { back: true, sit: true, arms: 'type2' },
};

// Dessine un personnage via rect(x, y, w, h, couleur). Sert à Phaser ET à l'aperçu HTML.
// pose : 0 = debout, 1 et 2 = pas de marche, ou une pose de POSES. Un contour sombre entoure la silhouette.
export function drawCharacter(look, rect, pose = 0) {
  const opts = typeof pose === 'number' ? { frame: pose } : pose;
  const grid = new Map();
  const put = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid.set(`${x + i + 1},${y + j + 1}`, c); };
  drawBody(look, put, opts);
  const cells = [...grid.keys()].map(k => k.split(',').map(Number));
  // Contour « doux » : chaque bord prend une version sombre de sa propre couleur (plus naturel qu'un trait noir),
  // un peu plus foncé en bas pour asseoir le personnage
  for (const [x, y] of cells) {
    const c = grid.get(`${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (grid.has(`${x + dx},${y + dy}`)) continue;
      rect(x + dx, y + dy, 1, 1, dy > 0 ? OUTLINE : mixDark(c));
    }
  }
  for (const [x, y] of cells) rect(x, y, 1, 1, grid.get(`${x},${y}`));
}

// Couleur de contour : la teinte du pixel, très assombrie et tirée vers le violet nuit du jeu
function mixDark(c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const k = 0.38;
  return (Math.round(r * k + 0x2b * 0.35) << 16) | (Math.round(g * k + 0x22 * 0.35) << 8) | Math.round(b * k + 0x36 * 0.35);
}

// Couleurs du haut, des bras, du bas et des chaussures selon la tenue
function outfitColors(look) {
  const { body, legs, skin } = look;
  const base = { top: body, arms: shade(body, 0.92), legs, shoes: 0x2a2a33, details: null };
  switch (look.outfit) {
    case 'mariniere':
      return { ...base, top: 0xf6f6f6, arms: 0xf6f6f6, details: put => { for (const y of [12, 14, 16]) put(3, y, 10, 1, 0x2b3a6b); } };
    case 'sweat':
      return { ...base, details: put => {
        put(4, 10, 8, 2, shade(body, 0.8)); put(5, 15, 6, 2, shade(body, 0.8));
        put(7, 12, 1, 2, 0xffffff); put(9, 12, 1, 2, 0xffffff);
      } };
    case 'robe': {
      const c = body === 0xffffff ? 0xe86a8c : body;
      return { ...base, top: c, arms: skin, legs: skin, details: put => {
        put(2, 18, 12, 3, c); put(2, 20, 12, 1, shade(c, 0.8)); put(6, 11, 4, 1, shade(c, 1.15));
      } };
    }
    case 'veste':
      return { ...base, top: 0x5a3a28, arms: 0x4a2f20, details: put => {
        put(6, 11, 4, 7, 0xf2efe8); put(5, 11, 1, 6, 0x6b4a36); put(10, 11, 1, 6, 0x6b4a36);
      } };
    case 'costume':
      return { ...base, top: 0x2b3245, arms: 0x252b3c, legs: 0x2b3245, shoes: 0x1a1a20, details: put => {
        put(6, 11, 4, 4, 0xffffff); put(7, 12, 2, 5, 0xb8403e);
      } };
    default:
      return base;
  }
}

// Bras dans une pose (dessinés devant le buste, avec l'objet tenu)
function drawArms(rect, kind, o, skin) {
  const sideL = () => { rect(1, 12, 2, 6, o.arms); rect(1, 18, 2, 2, skin); };
  switch (kind) {
    case 'type': case 'type2': { // vu de dos, les mains sur le clavier
      const d = kind === 'type2' ? 1 : 0;
      rect(1, 12, 2, 3, o.arms); rect(13, 12, 2, 3, o.arms); rect(2, 14, 2, 2, o.arms); rect(12, 14, 2, 2, o.arms);
      rect(3, 15 + d, 2, 1, skin); rect(11, 16 - d, 2, 1, skin);
      break;
    }
    case 'book':
      rect(1, 12, 2, 4, o.arms); rect(13, 12, 2, 4, o.arms);
      rect(4, 13, 8, 5, 0xb8403e); rect(5, 14, 6, 3, 0xf6f1e4); rect(8, 13, 1, 5, 0x7a2a28);
      rect(3, 15, 2, 2, skin); rect(11, 15, 2, 2, skin);
      break;
    case 'eat': // la fourchette à la bouche
      sideL(); rect(12, 11, 2, 4, o.arms); rect(10, 9, 2, 2, skin); rect(9, 8, 1, 2, 0xc9ced8);
      break;
    case 'fork':
      sideL(); rect(12, 12, 2, 4, o.arms); rect(11, 15, 2, 2, skin); rect(10, 13, 1, 3, 0xc9ced8);
      break;
    case 'cup_up': // on boit
      sideL(); rect(12, 11, 2, 4, o.arms); rect(10, 9, 2, 2, skin); rect(8, 8, 2, 3, 0xffffff); rect(8, 8, 2, 1, 0x6b4226);
      break;
    case 'cup':
      sideL(); rect(12, 12, 2, 4, o.arms); rect(11, 15, 2, 2, skin); rect(10, 13, 2, 2, 0xffffff);
      break;
    case 'pan': case 'pan2': { // poêle sur le feu, ça saute !
      const d = kind === 'pan2' ? -1 : 0;
      rect(1, 12, 2, 3, o.arms); rect(13, 12, 2, 3, o.arms); rect(2, 14, 2, 2, o.arms); rect(12, 14, 2, 2, o.arms);
      rect(3, 16 + d, 2, 1, skin); rect(11, 16, 2, 1, skin);
      rect(4, 16 + d, 7, 2, 0x34323d); rect(11, 16, 3, 1, 0x5a3a28);
      if (kind === 'pan2') { rect(6, 14, 2, 1, 0xf2a33a); rect(8, 13, 1, 1, 0x4caf50); }
      break;
    }
    default: break;
  }
}

// Silhouettes : largeur du buste et position des bras
const BUILDS = {
  mince: { x: 4, w: 8, armL: 2, armR: 12 },
  normal: { x: 3, w: 10, armL: 1, armR: 13 },
  fort: { x: 2, w: 12, armL: 0, armR: 14 },
};

function drawBody(look, rect, opts = {}) {
  const { skin, hairColor: hair } = look;
  const o = outfitColors(look);
  const B = BUILDS[look.build] || BUILDS.normal;
  const frame = opts.frame || 0;
  const back = !!opts.back;
  // Marche : une jambe se lève, les bras se balancent en opposition ; respiration : le haut du corps descend d'un pixel
  const liftL = frame === 1 ? 1 : 0, liftR = frame === 2 ? 1 : 0;
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const breath = opts.breath ? 1 : 0;
  const skinD = shade(skin, 0.86), skinL = shade(skin, 1.06);

  // ---------- Jambes et chaussures ----------
  if (opts.sit) { // assis : genoux devant, pieds posés
    rect(4, 19, 3, 3, o.legs); rect(9, 19, 3, 3, o.legs);
    rect(4, 19, 3, 1, shade(o.legs, 1.15)); rect(9, 19, 3, 1, shade(o.legs, 1.15));
    rect(3, 22, 4, 2, o.shoes); rect(9, 22, 4, 2, o.shoes);
    rect(3, 22, 4, 1, shade(o.shoes, 1.7)); rect(9, 22, 4, 1, shade(o.shoes, 1.7));
  } else {
    const leg = (x, lift) => {
      rect(x, 19, 3, 6 - lift, o.legs);
      rect(x, 19, 1, 6 - lift, shade(o.legs, 1.12));          // lumière à gauche
      rect(x + 2, 19, 1, 6 - lift, shade(o.legs, 0.8));       // ombre à droite
      rect(x + 1, 22 - lift, 1, 1, shade(o.legs, 0.88));      // pli du genou
      rect(x - 1, 25 - lift, 4, 2, o.shoes);                  // chaussure
      rect(x - 1, 25 - lift, 4, 1, shade(o.shoes, 1.8));      // reflet
      rect(x - 1, 26 - lift, 4, 1, shade(o.shoes, 0.7));      // semelle
    };
    leg(4, liftL); leg(9, liftR);
  }

  // ---------- Bras ----------
  if (!opts.arms) {
    const arm = (x, dy, side) => {
      rect(x, 12 + dy, 2, 6, o.arms);
      rect(side < 0 ? x : x + 1, 12 + dy, 1, 6, shade(o.arms, side < 0 ? 1.1 : 0.82));
      rect(x, 12 + dy, 2, 1, shade(o.arms, 1.15));             // épaule
      rect(x, 18 + dy, 2, 2, skin); rect(x, 19 + dy, 2, 1, skinD); // main
    };
    arm(B.armL, swing + breath, -1); arm(B.armR, -swing + breath, 1);
  }

  // ---------- Buste ----------
  const y0 = 11 + breath;
  rect(B.x, y0, B.w, 8 - breath, o.top);
  rect(B.x, y0, 1, 8 - breath, shade(o.top, 1.1));                 // lumière (gauche)
  rect(B.x + B.w - 1, y0, 1, 8 - breath, shade(o.top, 0.78));      // ombre (droite)
  rect(B.x + 1, y0, B.w - 2, 1, shade(o.top, 1.16));               // épaules
  rect(B.x, 18, B.w, 1, shade(o.legs, 0.7));                        // ceinture
  if (!back) {
    rect(6, y0, 4, 1, skin); rect(7, y0 + 1, 2, 1, skin);          // encolure
    rect(B.x + B.w - 3, y0 + 2, 1, 4, shade(o.top, 0.9));          // pli du vêtement
  }
  if (o.details && !back) o.details(rect);
  if (opts.arms) drawArms(rect, opts.arms, o, skin);

  // ---------- Tête ----------
  const hy = breath; // la tête suit la respiration
  rect(6, 10 + hy, 4, 1, skinD); // cou
  if (back) {
    // Vu de dos : la nuque, les oreilles et les cheveux
    const bald = look.hairStyle === 'chauve';
    rect(4, 3 + hy, 8, 8, bald ? shade(skin, 0.95) : hair);
    rect(3, 6 + hy, 1, 2, skin); rect(12, 6 + hy, 1, 2, skinD);
    if (!bald) { rect(11, 3 + hy, 1, 8, shade(hair, 0.78)); rect(5, 3 + hy, 3, 1, shade(hair, 1.35)); }
    if (look.hairStyle === 'long' || look.hairStyle === 'tresses') rect(4, 10 + hy, 8, 3, hair);
    if (look.hairStyle === 'tresses') { rect(4, 13 + hy, 2, 3, hair); rect(10, 13 + hy, 2, 3, hair); }
    if (look.hairStyle === 'queue') { rect(7, 10 + hy, 2, 4, hair); rect(7, 10 + hy, 2, 1, shade(hair, 0.8)); }
    if (look.hairStyle === 'carre') rect(4, 10 + hy, 8, 1, hair);
    if (look.hairStyle === 'boucles' || look.hairStyle === 'afro') { rect(3, 1 + hy, 10, 3, hair); rect(2, 2 + hy, 1, 7, hair); rect(13, 2 + hy, 1, 7, hair); }
    if (look.hairStyle === 'afro') { rect(2, 0 + hy, 12, 2, hair); rect(1, 2 + hy, 1, 6, hair); rect(14, 2 + hy, 1, 6, hair); }
    if (look.hairStyle === 'chignon') rect(6, 0 + hy, 4, 3, shade(hair, 0.9));
    if (look.hairStyle === 'crete') rect(7, 0 + hy, 2, 4, hair);
    if (look.hairStyle === 'casquette') { rect(4, 1 + hy, 8, 3, hair); rect(4, 4 + hy, 8, 4, shade(hair, 0.7)); }
    if (look.accessory === 'echarpe') rect(4, 10 + hy, 8, 2, 0xd94f4f);
    if (look.hat === 'beret') rect(4, 1 + hy, 9, 2, 0x2b2b33);
    if (look.hat === 'chapeau') { rect(5, 0 + hy, 6, 2, 0x222228); rect(5, 1 + hy, 6, 1, 0xb8403e); rect(3, 2 + hy, 10, 1, 0x222228); }
    return;
  }
  // Visage : volume (lumière à gauche, ombre à droite), oreilles, yeux avec reflet, sourcils, nez, bouche, joues
  rect(4, 3 + hy, 8, 8, skin);
  rect(4, 4 + hy, 1, 5, skinL);
  rect(11, 4 + hy, 1, 6, skinD); rect(5, 10 + hy, 6, 1, skinD);
  rect(3, 6 + hy, 1, 2, skin); rect(12, 6 + hy, 1, 2, skinD);       // oreilles
  rect(5, 6 + hy, 2, 2, 0xffffff); rect(6, 6 + hy, 1, 2, 0x1d1b2b);  // œil gauche
  rect(9, 6 + hy, 2, 2, 0xffffff); rect(9, 6 + hy, 1, 2, 0x1d1b2b);  // œil droit
  rect(6, 6 + hy, 1, 1, 0x4a5a7a); rect(9, 6 + hy, 1, 1, 0x4a5a7a);  // reflet bleuté
  if (look.hairStyle !== 'chauve') { rect(5, 5 + hy, 2, 1, shade(hair, 0.85)); rect(9, 5 + hy, 2, 1, shade(hair, 0.85)); } // sourcils
  rect(8, 8 + hy, 1, 1, skinD);                                       // nez
  rect(5, 8 + hy, 1, 1, 0xf09a9a); rect(10, 8 + hy, 1, 1, 0xf09a9a);  // joues
  rect(7, 9 + hy, 2, 1, 0xb5523b); rect(7, 9 + hy, 1, 1, 0x9a4030);   // bouche

  // Cheveux : deux tons (ombre + reflet) pour le volume
  const hD = shade(hair, 0.75), hL = shade(hair, 1.45);
  const H = (x, y, w, h, c = hair) => rect(x, y + hy, w, h, c);
  switch (look.hairStyle) {
    case 'court':
      H(4, 2, 8, 2); H(3, 3, 1, 3); H(12, 3, 1, 3, hD); H(4, 4, 2, 1); H(10, 4, 2, 1, hD); break;
    case 'long':
      H(4, 2, 8, 2); H(3, 3, 1, 10); H(12, 3, 1, 10, hD); H(4, 4, 1, 2); H(11, 4, 1, 2, hD); H(4, 4, 3, 1); break;
    case 'boucles':
      H(3, 1, 10, 3); H(2, 2, 1, 6); H(13, 2, 1, 6, hD); H(4, 4, 1, 1); H(11, 4, 1, 1, hD);
      H(4, 1, 1, 1, hL); H(8, 1, 1, 1, hL); H(2, 5, 1, 1, hL); break;
    case 'afro':
      H(2, 0, 12, 4); H(1, 2, 1, 6); H(14, 2, 1, 6, hD); H(2, 4, 2, 4); H(12, 4, 2, 4, hD);
      H(4, 0, 1, 1, hL); H(9, 0, 2, 1, hL); H(2, 3, 1, 1, hL); break;
    case 'chignon':
      H(4, 2, 8, 2); H(3, 3, 1, 4); H(12, 3, 1, 4, hD); H(6, 0, 4, 2, hD); H(7, 0, 2, 1); break;
    case 'queue': // queue de cheval
      H(4, 2, 8, 2); H(3, 3, 1, 3); H(12, 3, 1, 4, hD); H(13, 5, 1, 6, hD); H(4, 4, 2, 1); break;
    case 'carre': // carré au menton
      H(4, 2, 8, 2); H(3, 3, 1, 7); H(12, 3, 1, 7, hD); H(4, 4, 8, 1); H(4, 9, 1, 1); H(11, 9, 1, 1, hD); break;
    case 'tresses':
      H(4, 2, 8, 2); H(3, 3, 1, 4); H(12, 3, 1, 4, hD); H(5, 4, 6, 1);
      H(3, 7, 1, 6); H(12, 7, 1, 6, hD); H(3, 9, 1, 1, hD); H(3, 11, 1, 1, hD); H(12, 9, 1, 1, hair); break;
    case 'crete':
      H(7, 0, 2, 4); H(8, 0, 1, 4, hD); H(4, 3, 1, 2, hD); H(11, 3, 1, 2, hD); break;
    case 'casquette':
      H(3, 4, 1, 3, hD); H(4, 1, 8, 3); H(9, 3, 5, 1, hD); H(5, 1, 3, 1, hL); break;
    default: break; // rasé
  }
  // reflet dans les cheveux
  if (['court', 'long', 'chignon', 'queue', 'carre', 'tresses'].includes(look.hairStyle)) H(6, 2, 3, 1, hL);

  switch (look.accessory) {
    case 'lunettes':
      H(5, 5, 3, 3, 0x222222); H(9, 5, 3, 3, 0x222222); H(8, 6, 1, 1, 0x222222);
      H(6, 6, 1, 1, 0x9fd4f5); H(10, 6, 1, 1, 0x9fd4f5); break;
    case 'echarpe':
      H(4, 10, 8, 2, 0xd94f4f); H(9, 12, 2, 3, 0xd94f4f); H(4, 10, 8, 1, 0xe87070); break;
    case 'moustache':
      H(6, 8, 4, 1, shade(hair, 0.9)); break;
    case 'solaires':
      H(5, 5, 7, 1, 0x111111); H(5, 6, 3, 2, 0x1e1e2a); H(9, 6, 3, 2, 0x1e1e2a); H(5, 6, 1, 1, 0x5b6b8a); break;
    default: break;
  }

  // Chapeaux (achetés en boutique)
  if (look.hat === 'beret') { H(4, 1, 9, 2, 0x2b2b33); H(11, 0, 2, 1, 0x2b2b33); H(5, 1, 3, 1, 0x44444f); }
  if (look.hat === 'chapeau') { H(5, 0, 6, 2, 0x222228); H(5, 1, 6, 1, 0xb8403e); H(3, 2, 10, 1, 0x222228); }
}

// Crée (si besoin) les textures Phaser du personnage : debout (clé) + 2 pas de marche (clé_1, clé_2).
// La clé change quand l'apparence change.
export function ensureCharTexture(scene, actor) {
  if (!actor.texKey) actor.texKey = `char_${actor.id}_0`;
  if (scene.textures.exists(actor.texKey)) return actor.texKey;
  // debout + 2 pas (face) · _i = respiration · _b0 / _b1 / _b2 = de dos (quand on s'éloigne)
  const FRAMES = [['', 0], ['_1', 1], ['_2', 2], ['_i', { breath: true }], ['_b0', { back: true }], ['_b1', { back: true, frame: 1 }], ['_b2', { back: true, frame: 2 }]];
  for (const [suffix, pose] of FRAMES) {
    const key = actor.texKey + suffix;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x000000, 0.25); g.fillEllipse(9, 28, 13, 3.5);
    drawCharacter(actor.look, (x, y, w, h, c) => { g.fillStyle(c); g.fillRect(x, y, w, h); }, pose);
    g.generateTexture(key, CHAR_W, CHAR_H);
    g.destroy();
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return actor.texKey;
}

// Texture d'une pose (assis, vu de dos, cuisine…), créée la première fois qu'on en a besoin
export function ensurePose(scene, actor, name) {
  ensureCharTexture(scene, actor);
  if (!name || name === 'stand') return actor.texKey;
  const key = `${actor.texKey}_${name}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.25); g.fillEllipse(9, POSES[name].sit ? 25 : 28, 13, 3.5);
  drawCharacter(actor.look, (x, y, w, h, c) => { g.fillStyle(c); g.fillRect(x, y, w, h); }, POSES[name]);
  g.generateTexture(key, CHAR_W, CHAR_H);
  g.destroy();
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// Profil du joueur gardé sur l'appareil.
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem('world.profile')); } catch { return null; }
}
export function saveProfile(p) {
  try { localStorage.setItem('world.profile', JSON.stringify(p)); } catch { /* stockage indisponible */ }
}
