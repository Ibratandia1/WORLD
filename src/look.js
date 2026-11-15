import { shade } from './color.js';

// Apparence des personnages (joueur et PNJ) : dessin pixel art 16 x 28.
export const LOOK_OPTIONS = {
  skin: [0xf6d7c3, 0xf1c7a3, 0xd9a77e, 0xb57a52, 0x8a5634, 0x5e3a24],
  hairColor: [0x1c1410, 0x4a3020, 0x7a4a2a, 0xb5651d, 0xd9a441, 0xe8d8b0, 0xdddddd, 0xd94f9c, 0x5b8def],
  hairStyle: [['court', 'Court'], ['long', 'Long'], ['boucles', 'Boucles'], ['chignon', 'Chignon'],
    ['crete', 'Crête'], ['casquette', 'Casquette'], ['chauve', 'Rasé']],
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
    body: pick(O.body), legs: pick(O.legs),
    accessory: Math.random() < 0.7 ? 'aucun' : pick(O.accessory.slice(1))[0],
  };
}

// Dessine un personnage via rect(x, y, w, h, couleur). Sert à Phaser ET à l'aperçu HTML.
// frame : 0 = debout, 1 et 2 = pas de marche. Un contour sombre entoure la silhouette.
export function drawCharacter(look, rect, frame = 0) {
  const grid = new Map();
  const put = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid.set(`${x + i + 1},${y + j + 1}`, c); };
  drawBody(look, put, frame);
  const cells = [...grid.keys()].map(k => k.split(',').map(Number));
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!grid.has(`${x + dx},${y + dy}`)) rect(x + dx, y + dy, 1, 1, OUTLINE);
    }
  }
  for (const [x, y] of cells) rect(x, y, 1, 1, grid.get(`${x},${y}`));
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

function drawBody(look, rect, frame) {
  const { skin, hairColor: hair } = look;
  const o = outfitColors(look);
  // Marche : une jambe se lève, les bras se balancent en opposition
  const liftL = frame === 1 ? 1 : 0, liftR = frame === 2 ? 1 : 0;
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;

  rect(4, 19, 3, 6 - liftL, o.legs); rect(9, 19, 3, 6 - liftR, o.legs);
  rect(4, 19, 1, 6 - liftL, shade(o.legs, 0.82)); rect(9, 19, 1, 6 - liftR, shade(o.legs, 0.82));
  rect(3, 25 - liftL, 4, 2, o.shoes); rect(9, 25 - liftR, 4, 2, o.shoes);
  rect(3, 25 - liftL, 4, 1, shade(o.shoes, 1.6)); rect(9, 25 - liftR, 4, 1, shade(o.shoes, 1.6));

  rect(1, 12 + swing, 2, 6, o.arms); rect(13, 12 - swing, 2, 6, o.arms);
  rect(1, 18 + swing, 2, 2, skin); rect(13, 18 - swing, 2, 2, skin);

  rect(3, 11, 10, 8, o.top);
  rect(3, 11, 1, 8, shade(o.top, 0.8)); rect(12, 11, 1, 8, shade(o.top, 0.8));
  rect(4, 11, 8, 1, shade(o.top, 1.12));
  rect(3, 18, 10, 1, shade(o.legs, 0.7)); // ceinture
  if (o.details) o.details(rect);

  // Tête
  rect(6, 10, 4, 1, shade(skin, 0.8));
  rect(4, 3, 8, 8, skin);
  rect(11, 4, 1, 6, shade(skin, 0.9)); rect(5, 10, 6, 1, shade(skin, 0.92));
  rect(5, 6, 2, 2, 0xffffff); rect(6, 6, 1, 2, 0x1d1b2b);
  rect(9, 6, 2, 2, 0xffffff); rect(9, 6, 1, 2, 0x1d1b2b);
  rect(5, 8, 1, 1, 0xf09a9a); rect(10, 8, 1, 1, 0xf09a9a);
  rect(7, 9, 2, 1, 0xb5523b);

  switch (look.hairStyle) {
    case 'court':
      rect(4, 2, 8, 2, hair); rect(3, 3, 1, 3, hair); rect(12, 3, 1, 3, hair); rect(4, 4, 2, 1, hair); break;
    case 'long':
      rect(4, 2, 8, 2, hair); rect(3, 3, 1, 10, hair); rect(12, 3, 1, 10, hair); rect(4, 4, 1, 2, hair); rect(11, 4, 1, 2, hair); break;
    case 'boucles':
      rect(3, 1, 10, 3, hair); rect(2, 2, 1, 6, hair); rect(13, 2, 1, 6, hair); rect(4, 4, 1, 1, hair); rect(11, 4, 1, 1, hair); break;
    case 'chignon':
      rect(4, 2, 8, 2, hair); rect(3, 3, 1, 4, hair); rect(12, 3, 1, 4, hair); rect(6, 0, 4, 2, hair); break;
    case 'crete':
      rect(7, 0, 2, 4, hair); rect(4, 3, 1, 2, shade(hair, 0.8)); rect(11, 3, 1, 2, shade(hair, 0.8)); break;
    case 'casquette':
      rect(3, 4, 1, 3, shade(hair, 0.7)); rect(4, 1, 8, 3, hair); rect(9, 3, 5, 1, shade(hair, 0.8)); break;
    default: break; // chauve
  }
  // reflet dans les cheveux
  if (['court', 'long', 'boucles', 'chignon'].includes(look.hairStyle)) rect(6, 2, 3, 1, shade(hair, 1.45));

  switch (look.accessory) {
    case 'lunettes':
      rect(5, 5, 3, 3, 0x222222); rect(9, 5, 3, 3, 0x222222); rect(8, 6, 1, 1, 0x222222);
      rect(6, 6, 1, 1, 0x9fd4f5); rect(10, 6, 1, 1, 0x9fd4f5); break;
    case 'echarpe':
      rect(4, 10, 8, 2, 0xd94f4f); rect(9, 12, 2, 3, 0xd94f4f); break;
    case 'moustache':
      rect(6, 8, 4, 1, shade(hair, 0.9)); break;
    case 'solaires':
      rect(5, 5, 7, 1, 0x111111); rect(5, 6, 3, 2, 0x1e1e2a); rect(9, 6, 3, 2, 0x1e1e2a); rect(5, 6, 1, 1, 0x5b6b8a); break;
    default: break;
  }

  // Chapeaux (achetés en boutique)
  if (look.hat === 'beret') { rect(4, 1, 9, 2, 0x2b2b33); rect(11, 0, 2, 1, 0x2b2b33); }
  if (look.hat === 'chapeau') { rect(5, 0, 6, 2, 0x222228); rect(5, 1, 6, 1, 0xb8403e); rect(3, 2, 10, 1, 0x222228); }
}

// Crée (si besoin) les textures Phaser du personnage : debout (clé) + 2 pas de marche (clé_1, clé_2).
// La clé change quand l'apparence change.
export function ensureCharTexture(scene, actor) {
  if (!actor.texKey) actor.texKey = `char_${actor.id}_0`;
  if (scene.textures.exists(actor.texKey)) return actor.texKey;
  [0, 1, 2].forEach(frame => {
    const key = frame ? `${actor.texKey}_${frame}` : actor.texKey;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x000000, 0.25); g.fillEllipse(9, 28, 13, 3.5);
    drawCharacter(actor.look, (x, y, w, h, c) => { g.fillStyle(c); g.fillRect(x, y, w, h); }, frame);
    g.generateTexture(key, CHAR_W, CHAR_H);
    g.destroy();
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  });
  return actor.texKey;
}

// Profil du joueur gardé sur l'appareil.
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem('world.profile')); } catch { return null; }
}
export function saveProfile(p) {
  try { localStorage.setItem('world.profile', JSON.stringify(p)); } catch { /* stockage indisponible */ }
}
