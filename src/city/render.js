import { TW, TH, toScreen } from '../iso.js';
import { shade } from '../color.js';

// Rendu détaillé de la ville (dessiné par le code) : façades, toits, rue, mobilier urbain, voitures.
const HW = TW / 2, HH = TH / 2;
export const depthAt = (x, y) => 10 + (x + y) * 10;

// Petit générateur aléatoire déterministe : la ville est identique à chaque lancement
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

const q = (g, pts, color, alpha = 1) => { g.fillStyle(color, alpha); g.fillPoints(pts, true); };

// ---------- Nuit ----------
export const NIGHT = 0x05070f;
export const NIGHT_MAX = 0.84; // opacité de l'obscurité en pleine nuit

// Dessin « jumeau » : tout ce qu'on dessine est recopié en couleur nuit dans un 2e calque juste au-dessus.
// La nuit, on rend ce calque opaque : l'objet s'assombrit, mais les lumières (dessinées encore au-dessus) restent vives.
const NOT_MIRRORED = new Set(['setDepth', 'setAlpha', 'setBlendMode', 'setVisible', 'setScale', 'destroy', 'setPosition']);
export function twin(scene, depth, darks) {
  const g = scene.add.graphics().setDepth(depth);
  const d = scene.add.graphics().setDepth(depth + 0.05).setAlpha(0);
  darks.push(d);
  return new Proxy(g, {
    get(t, prop) {
      const v = t[prop];
      if (typeof v !== 'function') return v;
      return (...args) => {
        const r = v.apply(t, args);
        if (prop === 'fillStyle') d.fillStyle(NIGHT, args[1] ?? 1);
        else if (prop === 'lineStyle') d.lineStyle(args[0], NIGHT, args[2] ?? 1);
        else if (!NOT_MIRRORED.has(prop) && typeof d[prop] === 'function') d[prop](...args);
        return r;
      };
    },
  });
}

// Boîte isométrique dont la base est centrée en (cx, cy) à l'écran ; fw/fd en fraction de case
export function isoBox(g, cx, cy, fw, fd, h, color, z0 = 0, alpha = 1) {
  const pt = (dx, dy, z) => ({ x: cx + (dx - dy) * HW, y: cy + (dx + dy) * HH - z });
  const a = fw / 2, d = fd / 2, z1 = z0 + h;
  const col = typeof color === 'object' ? color : { top: color, left: shade(color, 0.86), right: shade(color, 0.72) };
  q(g, [pt(-a, d, z1), pt(a, d, z1), pt(a, d, z0), pt(-a, d, z0)], col.left, alpha);
  q(g, [pt(a, d, z1), pt(a, -d, z1), pt(a, -d, z0), pt(a, d, z0)], col.right, alpha);
  q(g, [pt(-a, -d, z1), pt(a, -d, z1), pt(a, d, z1), pt(-a, d, z1)], col.top, alpha);
}

// ---------- Bâtiments ----------
// g = dessin du bâtiment, lg = calque des fenêtres allumées (visible la nuit)
export function drawBuildingTile(g, lg, cx, cy, h, T, info) {
  const { type, expL, expR, expBL, expBR, r } = info;
  const top = [{ x: cx, y: cy - HH - h }, { x: cx + HW, y: cy - h }, { x: cx, y: cy + HH - h }, { x: cx - HW, y: cy - h }];
  q(g, [{ x: cx - HW, y: cy - h }, { x: cx, y: cy + HH - h }, { x: cx, y: cy + HH }, { x: cx - HW, y: cy }], T.left);
  q(g, [{ x: cx, y: cy + HH - h }, { x: cx + HW, y: cy - h }, { x: cx + HW, y: cy }, { x: cx, y: cy + HH }], T.right);

  // Rectangle sur une face : hauteurs z1..z2, portion u1..u2 de la largeur
  const face = (side, z1, z2, u1 = 0, u2 = 1) => {
    const X = u => (side === 'L' ? cx - HW + HW * u : cx + HW * u);
    const Y = u => (side === 'L' ? cy + HH * u : cy + HH - HH * u);
    return [{ x: X(u1), y: Y(u1) - z2 }, { x: X(u2), y: Y(u2) - z2 }, { x: X(u2), y: Y(u2) - z1 }, { x: X(u1), y: Y(u1) - z1 }];
  };
  const sides = [...(expL ? ['L'] : []), ...(expR ? ['R'] : [])];
  const dim = side => (side === 'L' ? 1 : 0.86);

  if (type === 'office') {
    for (const side of sides) {
      for (let z = 6; z < h - 8; z += 12) {
        q(g, face(side, z, z + 8), shade(0xbfe0f5, dim(side)), 0.9);
        q(g, face(side, z + 5, z + 8, 0.05, 0.45), 0xffffff, 0.35);
        for (const [u1, u2] of [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]) {
          if (r() < 0.6) q(lg, face(side, z, z + 8, u1 + 0.02, u2 - 0.02), 0xffe3a0);
        }
      }
      for (const u of [0.25, 0.5, 0.75]) q(g, face(side, 4, h - 6, u - 0.012, u + 0.012), 0x6f8fae);
      q(g, face(side, 0, 5), 0x4f6278);
    }
  } else if (type === 'metro') {
    for (const side of sides) q(g, face(side, 4, 16, 0.15, 0.85), 0x23573f);
  } else {
    for (const side of sides) {
      const base = side === 'L' ? T.left : T.right;
      q(g, face(side, 0, 6), shade(base, 0.82)); // soubassement en pierre
      if (type === 'home') for (let z = 28; z < h - 6; z += 18) q(g, face(side, z - 1, z + 1), shade(base, 1.07)); // corniches
      const first = T.firstFloor ?? 10;
      for (let z = first; z < h - 14; z += 18) {
        for (const [u1, u2] of [[0.14, 0.36], [0.56, 0.78]]) {
          q(g, face(side, z - 1, z + 12, u1 - 0.03, u2 + 0.03), 0xffffff, 0.92);
          q(g, face(side, z, z + 11, u1, u2), shade(0x6d8fb3, dim(side)));
          q(g, face(side, z + 6, z + 11, u1, (u1 + u2) / 2), 0xb9d4ee, 0.6);
          if (r() < 0.7) {
            q(lg, face(side, z, z + 11, u1, u2), 0xffcf6b);
            q(lg, face(side, z + 1, z + 6, u1 + 0.02, u2 - 0.02), 0xfff1c2); // cœur plus clair
          }
          // Balcons en fer forgé, très parisiens
          if (type === 'home' && z > first) q(g, face(side, z - 4, z - 1, u1 - 0.06, u2 + 0.06), 0x34323d, 0.9);
        }
      }
      if (type === 'home' && side === 'L' && info.door) q(g, face('L', 0, 15, 0.42, 0.58), 0x6b4226);
      if (T.awning) {
        q(g, face(side, 2, 15), 0x41566e);
        q(g, face(side, 2, 15, 0.08, 0.3), 0x6d87a3, 0.8);
        q(lg, face(side, 3, 14, 0.04, 0.96), 0xffd98a, 0.95);
        q(lg, face(side, 0, 3, -0.02, 1.02), 0xffb84d, 0.5); // la vitrine éclaire le trottoir
        for (let i = 0; i < 6; i++) {
          const c = i % 2 ? 0xffffff : T.awning;
          q(g, face(side, 15, 22, i / 6, (i + 1) / 6), shade(c, dim(side)));
        }
        q(g, face(side, 14, 15), shade(T.awning, 0.7));
      }
    }
  }

  // Mairie : colonnes de pierre au rez-de-chaussée, fronton, grande porte, horloge et drapeau
  if (type === 'cityhall') {
    for (const side of sides) {
      const base = side === 'L' ? T.left : T.right;
      q(g, face(side, 0, 26), shade(base, 0.9));
      for (const u of [0.1, 0.36, 0.62, 0.88]) {
        q(g, face(side, 2, 24, u - 0.045, u + 0.045), shade(0xfaf5ea, dim(side)));
        q(g, face(side, 2, 24, u + 0.02, u + 0.045), shade(0xd8ccb2, dim(side)));
        q(g, face(side, 22, 25, u - 0.06, u + 0.06), shade(0xe8dfcc, dim(side)));
      }
      q(g, face(side, 24, 30), shade(0xeee5d2, dim(side)));   // entablement
      q(g, face(side, 29, 31), shade(0xb9ab8f, dim(side)));
      if (side === 'L' && info.door) {
        q(g, face('L', 0, 20, 0.4, 0.6), 0x4a3424);          // grande porte
        q(g, face('L', 14, 20, 0.4, 0.6), 0xffd98a, 0.5);
        q(lg, face('L', 1, 19, 0.42, 0.58), 0xffcf6b);
        q(g, face('L', h - 22, h - 10, 0.43, 0.57), 0xfaf5ea); // horloge
        q(g, face('L', h - 20, h - 12, 0.46, 0.54), 0x2b2f3a);
      }
    }
  }

  // Services publics : chacun reconnaissable de loin
  if (type === 'police') {
    for (const side of sides) {
      q(g, face(side, 18, 23), shade(0x2b4ea2, dim(side)));                    // bandeau bleu
      q(g, face(side, 19, 22, 0.08, 0.92), shade(0x3f66c4, dim(side)));
      q(g, face(side, 0, 16, 0.3, 0.7), shade(0x34405a, dim(side)));            // portes vitrées
      q(lg, face(side, 1, 15, 0.32, 0.68), 0xd8e6ff);
    }
    if (info.door) { q(g, face('L', 25, 30, 0.45, 0.55), 0x2b4ea2); q(lg, face('L', 26, 29, 0.46, 0.54), 0x6ea8ff); } // gyrophare / lanterne
  }
  if (type === 'hospital') {
    for (const side of sides) {
      q(g, face(side, 0, 14, 0.25, 0.75), shade(0x9fc6e0, dim(side)));         // grande entrée vitrée
      q(lg, face(side, 1, 13, 0.27, 0.73), 0xe8f4ff);
    }
    if (info.door) {                                                              // croix rouge sur la façade
      q(g, face('L', h - 30, h - 10, 0.44, 0.56), 0xffffff); q(g, face('L', h - 26, h - 14, 0.38, 0.62), 0xffffff);
      q(g, face('L', h - 28, h - 12, 0.46, 0.54), 0xd8504d); q(g, face('L', h - 24, h - 16, 0.4, 0.6), 0xd8504d);
      q(lg, face('L', h - 28, h - 12, 0.46, 0.54), 0xff6b6b);
    }
  }
  if (type === 'firestation') {
    for (const side of sides) {
      q(g, face(side, 0, 28, 0.08, 0.92), shade(0xf2efe8, dim(side)));         // encadrement blanc
      q(g, face(side, 0, 26, 0.12, 0.88), shade(0x8c2a22, dim(side)));         // grande porte rouge du garage
      for (let z = 4; z < 26; z += 5) q(g, face(side, z, z + 1, 0.12, 0.88), shade(0x6e1f19, dim(side)));
      q(lg, face(side, 0, 3, 0.1, 0.9), 0xffb84d, 0.6);
    }
  }
  if (type === 'prison') {
    for (const side of sides) {
      for (let z = 14; z < h - 10; z += 16) for (const u of [0.2, 0.5, 0.8]) {
        q(g, face(side, z, z + 7, u - 0.05, u + 0.05), 0x2b2b33);               // petites fenêtres
        for (const k of [-0.02, 0.02]) q(g, face(side, z, z + 7, u + k - 0.006, u + k + 0.006), 0x8a8f99); // barreaux
        q(lg, face(side, z + 1, z + 6, u - 0.04, u + 0.04), 0xffe3a0, 0.5);
      }
      q(g, face(side, h - 4, h, 0, 1), shade(0x7d7a72, dim(side)));            // chemin de ronde
      if (side === 'L' && info.door) q(g, face('L', 0, 16, 0.4, 0.6), 0x3a3a42); // porte blindée
    }
  }
  if (type === 'school') {
    for (const side of sides) {
      q(g, face(side, h - 14, h - 9, 0, 1), shade(0xe5a33a, dim(side)));        // frise colorée
      for (let i = 0; i < 8; i++) q(g, face(side, h - 13, h - 10, i / 8 + 0.02, i / 8 + 0.08), [0xd8504d, 0x3fae73, 0x2b4ea2, 0xf2c94c][i % 4]);
      if (side === 'L' && info.door) { q(g, face('L', 0, 18, 0.38, 0.62), 0x2f7d5b); q(g, face('L', h - 24, h - 16, 0.44, 0.56), 0xfaf5ea); }
    }
  }

  // Ombre de contact au pied des façades (le bâtiment « pèse » sur le sol)
  for (const side of sides) q(g, face(side, 0, 4), 0x000000, 0.16);

  // Toit
  q(g, top, T.roof);
  const rim = shade(T.roof, 1.2);
  g.lineStyle(2, rim, 1);
  if (expL) g.lineBetween(top[3].x, top[3].y, top[2].x, top[2].y);
  if (expR) g.lineBetween(top[2].x, top[2].y, top[1].x, top[1].y);
  if (expBL) g.lineBetween(top[3].x, top[3].y, top[0].x, top[0].y);
  if (expBR) g.lineBetween(top[0].x, top[0].y, top[1].x, top[1].y);

  const roofAt = (dx, dy) => ({ x: cx + (dx - dy) * HW, y: cy - h + (dx + dy) * HH });
  if (type === 'home' || type === 'cafe' || type === 'bakery' || type === 'shop') {
    // zinc : fines lignes
    g.lineStyle(1, shade(T.roof, 0.88), 0.8);
    for (const k of [-0.25, 0, 0.25]) {
      const p1 = roofAt(-0.45, k), p2 = roofAt(0.45, k);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
  }
  if (type === 'home' && r() < 0.45) {
    const p = roofAt(-0.15 + r() * 0.2, -0.2 + r() * 0.15);
    isoBox(g, p.x, p.y, 0.18, 0.14, 10, 0xd8c3a5);
    isoBox(g, p.x, p.y, 0.05, 0.05, 3, 0xd2694a, 10);
  }
  if ((type === 'office' || type === 'shop' || type === 'cafe') && r() < 0.3) {
    const p = roofAt(-0.1, -0.15);
    isoBox(g, p.x, p.y, 0.3, 0.24, 7, 0xd9dde3);
    g.fillStyle(0x8a919c); g.fillEllipse(p.x, p.y - 7, 8, 4);
  }
  if ((type === 'bakery' || type === 'cafe') && r() < 0.35) {
    const p = roofAt(0.1, -0.05);
    isoBox(g, p.x, p.y, 0.4, 0.3, 2, 0x6fbf5a);
    g.fillStyle(0xf28ab2); g.fillCircle(p.x - 3, p.y - 3, 1.5); g.fillCircle(p.x + 4, p.y - 4, 1.5);
  }
  if (type === 'cityhall' && info.door) {
    // Drapeau tricolore sur le toit
    const p = roofAt(0, 0);
    g.fillStyle(0x34323d); g.fillRect(p.x - 1, p.y - 34, 2, 34);
    for (const [i, c] of [[0, 0x2b4ea2], [1, 0xffffff], [2, 0xd8504d]].map(([i, c]) => [i, c])) {
      g.fillStyle(c); g.fillRect(p.x + 1 + i * 5, p.y - 34, 5, 11);
    }
    g.fillStyle(0xf2c94c); g.fillCircle(p.x, p.y - 35, 1.6);
  }
  g.lineStyle(1, 0x000000, 0.1);
  g.lineBetween(cx, cy + HH - h, cx, cy + HH);
}

// Statue de Marianne sur son socle, avec parterre de fleurs ; un projecteur l'éclaire la nuit
export function drawStatue(g, lights, scene, x, y) {
  const s = { x, y };
  g.fillStyle(0x000000, 0.18); g.fillEllipse(s.x + 3, s.y + 4, 46, 18);
  // parterre
  g.fillStyle(0x5aa84a); g.fillEllipse(s.x, s.y + 1, 44, 19);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.fillStyle([0xd8504d, 0xffffff, 0x2b4ea2, 0xf2c94c][i % 4]); g.fillCircle(s.x + Math.cos(a) * 19, s.y + 1 + Math.sin(a) * 7.5, 1.8);
  }
  // socle de pierre (2 marches + colonne)
  isoBox(g, s.x, s.y, 0.5, 0.5, 4, { top: 0xe8dfcc, left: 0xcfc4ad, right: 0xb5a98f });
  isoBox(g, s.x, s.y, 0.38, 0.38, 4, { top: 0xf0e8d6, left: 0xd8ccb4, right: 0xbfb39a }, 4);
  isoBox(g, s.x, s.y, 0.24, 0.24, 18, { top: 0xf3ecdc, left: 0xddd2bb, right: 0xc4b89f }, 8);
  g.fillStyle(0xb8963c); g.fillRect(s.x - 5, s.y - 18, 6, 3); // plaque dorée
  // Marianne en bronze patiné : robe drapée, bras levé tenant un rameau, bonnet
  const B = 0x5f8f7f, D = 0x456e61, L = 0x86b5a3;
  const top = s.y - 26;
  g.fillStyle(D); g.fillTriangle(s.x - 7, top, s.x + 7, top, s.x, top - 22);       // robe
  g.fillStyle(B); g.fillTriangle(s.x - 6, top, s.x + 4, top, s.x - 1, top - 21);
  g.fillStyle(L); g.fillTriangle(s.x - 3, top - 4, s.x, top - 4, s.x - 2, top - 18);
  g.fillStyle(B); g.fillRect(s.x - 3, top - 27, 5, 7);                            // buste
  g.fillStyle(B); g.fillCircle(s.x - 0.5, top - 30, 3.2);                          // tête
  g.fillStyle(D); g.fillTriangle(s.x - 4, top - 31, s.x + 3, top - 31, s.x + 4, top - 36); // bonnet
  g.lineStyle(2, B, 1); g.lineBetween(s.x + 2, top - 25, s.x + 7, top - 38);       // bras levé
  g.fillStyle(0x7fae5a); g.fillCircle(s.x + 8, top - 40, 2.5); g.fillCircle(s.x + 6, top - 42, 2); // rameau
  g.lineStyle(2, D, 1); g.lineBetween(s.x - 3, top - 24, s.x - 7, top - 14);       // bras baissé
  g.fillStyle(D); g.fillRect(s.x - 10, top - 15, 5, 7);                            // tablette
  // projecteur la nuit
  const glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  for (const [r, a] of [[30, 0.08], [20, 0.12], [12, 0.16]]) { glow.fillStyle(0xfff0c0, a); glow.fillEllipse(s.x, top - 18, r * 1.2, r * 2); }
  lights.push(glow);
  return glow;
}

// Ombre portée au sol (soleil en haut à gauche)
export function drawShadow(sg, cx, cy, h) {
  const s = Math.min(1.1, h / 80);
  sg.fillStyle(0x1b1f3a, 0.16);
  sg.fillPoints([
    { x: cx + HW, y: cy }, { x: cx, y: cy + HH },
    { x: cx + s * HW, y: cy + HH + s * HH }, { x: cx + HW + s * HW, y: cy + s * HH },
  ], true);
}

// ---------- Sol : bordures de trottoir, passages piétons, fleurs, quai ----------
export function drawGroundDetails(scene, map) {
  const { w, h, tiles } = map;
  const g = scene.add.graphics().setDepth(0.3);
  const ground = (x, y) => (tiles[y] && tiles[y][x] ? tiles[y][x].ground : null);
  const P = (x, y) => toScreen(x, y);
  const r = rng(1234);

  const isRoad = (x, y) => ground(x, y) === 'road';
  const roadLinks = (x, y) => ({ e: isRoad(x + 1, y), w: isRoad(x - 1, y), s: isRoad(x, y + 1), n: isRoad(x, y - 1) });
  const linkCount = l => l.e + l.w + l.s + l.n;
  const straight = l => (linkCount(l) === 2 && ((l.e && l.w) || (l.n && l.s))) || (linkCount(l) === 1);
  const isJunction = (x, y) => isRoad(x, y) && !straight(roadLinks(x, y));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gr = ground(x, y);
      // Bordure entre trottoir (ou ruelle) et rue, dans les 4 directions
      if ((gr === 'pave' || gr === 'cobble' || gr === 'grass') && !tiles[y][x].building) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!isRoad(x + dx, y + dy)) continue;
          const a = dy ? P(x - 0.5, y + dy / 2) : P(x + dx / 2, y - 0.5);
          const b = dy ? P(x + 0.5, y + dy / 2) : P(x + dx / 2, y + 0.5);
          g.lineStyle(4, 0xd4d7df, 1); g.lineBetween(a.x, a.y, b.x, b.y);
          g.lineStyle(1, 0x8d93a3, 1); g.lineBetween(a.x, a.y + 2, b.x, b.y + 2);
        }
      }
      if (gr === 'road') {
        const l = roadLinks(x, y);
        const alongX = l.e || l.w;
        if (straight(l)) {
          // Passage piéton juste avant un carrefour ou un coude, sinon pointillés au milieu
          const nearJ = alongX ? (isJunction(x + 1, y) || isJunction(x - 1, y)) : (isJunction(x, y + 1) || isJunction(x, y - 1));
          if (nearJ) {
            g.lineStyle(3, 0xffffff, 0.85);
            for (let k = 0; k < 4; k++) {
              const v = -0.36 + k * 0.24;
              const a = alongX ? P(x - 0.32, y + v) : P(x + v, y - 0.32);
              const b = alongX ? P(x + 0.32, y + v) : P(x + v, y + 0.32);
              g.lineBetween(a.x, a.y, b.x, b.y);
            }
          } else if ((x + y) % 2 === 0) {
            const a = alongX ? P(x - 0.22, y) : P(x, y - 0.22);
            const b = alongX ? P(x + 0.22, y) : P(x, y + 0.22);
            g.lineStyle(2, 0xffffff, 0.7); g.lineBetween(a.x, a.y, b.x, b.y);
          }
        }
      }
      // Herbe : touffes et fleurs
      if (gr === 'grass' && !tiles[y][x].deco) {
        const s = P(x, y);
        for (let i = 0; i < 5; i++) {
          const ox = (r() - 0.5) * 36, oy = (r() - 0.5) * 16;
          const c = [0xffffff, 0xf28ab2, 0xffd23f, 0xb48cf2, 0x6fbf5a][Math.floor(r() * 5)];
          g.fillStyle(c, 0.9); g.fillCircle(s.x + ox, s.y + oy, c === 0x6fbf5a ? 2.5 : 1.4);
        }
      }
      // Quai de Seine
      if (gr === 'water' && ground(x, y + 1) && ground(x, y + 1) !== 'water') {
        const a = P(x - 0.5, y + 0.5), b = P(x + 0.5, y + 0.5);
        g.lineStyle(5, 0xcfc6b4, 1); g.lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(1, 0x9c9282, 1); g.lineBetween(a.x, a.y + 3, b.x, b.y + 3);
      }
    }
  }

  // Reflets animés sur l'eau
  const wg = scene.add.graphics().setDepth(0.2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (ground(x, y) !== 'water') continue;
    const s = P(x, y);
    wg.lineStyle(1.5, 0xffffff, 0.5);
    wg.lineBetween(s.x - 10 + r() * 6, s.y - 3 + r() * 6, s.x + 4 + r() * 6, s.y - 3 + r() * 6);
  }
  scene.tweens.add({ targets: wg, alpha: 0.2, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
}

// ---------- Mobilier urbain, arbres, fontaine, terrasses ----------
export function drawStreetDecor(scene, map, lights, darks, season = 'printemps') {
  const { w, h, tiles } = map;
  const ground = (x, y) => (tiles[y] && tiles[y][x] ? tiles[y][x].ground : null);
  const r = rng(98765);
  const add = (x, y, extra = 2) => twin(scene, depthAt(x, y) + extra, darks);
  const spots = { benches: [], fountains: [], statues: [], trees: [] }; // objets de la rue avec lesquels on peut interagir

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      const s = toScreen(x, y);

      if (t.deco === 'tree') {
        const tree = { g: add(x, y, 0), x: s.x, y: s.y, blossom: r() < 0.25 };
        drawTree(tree.g, tree.x, tree.y, tree.blossom, season);
        spots.trees.push(tree); // redessinés quand la saison change
      }

      if (t.deco === 'statue') {
        spots.statues.push({ x, y });
        const glow = drawStatue(add(x, y, 0), lights, scene, s.x, s.y);
        glow.setDepth(depthAt(x, y) + 0.2);
      }

      if (t.deco === 'fountain') {
        spots.fountains.push({ x, y });
        const g = add(x, y, 0);
        g.fillStyle(0x000000, 0.15); g.fillEllipse(s.x, s.y + 3, 50, 20);
        g.fillStyle(0xcfc6b4); g.fillEllipse(s.x, s.y, 48, 22);
        g.fillStyle(0xb5ab98); g.fillEllipse(s.x, s.y + 2, 48, 20);
        g.fillStyle(0x7cc6f2); g.fillEllipse(s.x, s.y - 1, 40, 16);
        g.fillStyle(0xcfc6b4); g.fillRect(s.x - 3, s.y - 14, 6, 13);
        const jets = add(x, y, 0.5);
        jets.fillStyle(0xe8f6ff, 0.9);
        for (const dx of [-8, 0, 8]) jets.fillEllipse(s.x + dx, s.y - 16 - (dx ? 0 : 6), 4, dx ? 14 : 22);
        scene.tweens.add({ targets: jets, scaleY: 0.85, alpha: 0.7, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }

      if (!t.walk || (t.ground !== 'pave' && t.ground !== 'cobble')) continue;

      // Lampadaires le long des rues (dans les deux sens), lanternes sur les places pavées
      const side = ground(x, y + 1) === 'road' ? [0, 1] : ground(x, y - 1) === 'road' ? [0, -1]
        : ground(x + 1, y) === 'road' ? [1, 0] : ground(x - 1, y) === 'road' ? [-1, 0] : null;
      const along = side ? (side[1] ? x : y) : 0;
      const nearMonument = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => { const n = tiles[y + dy] && tiles[y + dy][x + dx]; return n && (n.deco === 'statue' || n.deco === 'fountain'); }));
      const plazaLamp = !side && !nearMonument && t.ground === 'cobble' && (x * 7 + y * 3) % 11 === 0;
      if ((side && along % 4 === 2) || plazaLamp) {
        const px = x + (side ? side[0] * 0.36 : 0), py = y + (side ? side[1] * 0.36 : 0);
        const b = toScreen(px, py);
        const g = add(px, py);
        g.fillStyle(0x000000, 0.15); g.fillEllipse(b.x, b.y + 1, 8, 3);
        g.fillStyle(0x34323d); g.fillRect(b.x - 1, b.y - 32, 2, 32); g.fillRect(b.x - 2.5, b.y - 2, 5, 3);
        g.fillStyle(0x34323d); g.fillRect(b.x - 3.5, b.y - 37, 7, 5);
        g.fillStyle(0xfff3c4); g.fillRect(b.x - 2.5, b.y - 36, 5, 3);
        // Halo de la lampe (au-dessus) et flaque de lumière chaude au sol (sous les passants)
        const halo = scene.add.graphics().setDepth(depthAt(px, py) + 2.1).setBlendMode(Phaser.BlendModes.ADD);
        for (const [r, a] of [[22, 0.1], [14, 0.18], [8, 0.35], [4, 0.7]]) { halo.fillStyle(0xffd27a, a); halo.fillCircle(b.x, b.y - 35, r); }
        const pool = scene.add.graphics().setDepth(0.6).setBlendMode(Phaser.BlendModes.ADD);
        for (const [w, h, a] of [[110, 46, 0.08], [76, 32, 0.12], [44, 18, 0.16]]) { pool.fillStyle(0xffc766, a); pool.fillEllipse(b.x, b.y + 2, w, h); }
        lights.push(halo, pool);
      } else if (side && t.ground === 'pave' && along % 4 === 0 && r() < 0.7) {
        // Bacs à fleurs
        const px = x + (side[0] ? side[0] * 0.3 : 0.1), py = y + (side[1] ? side[1] * 0.3 : 0.1);
        const b = toScreen(px, py);
        const g = add(px, py);
        isoBox(g, b.x, b.y, 0.32, 0.2, 6, 0xcfc6b4);
        for (let i = 0; i < 5; i++) {
          g.fillStyle([0x4caf50, 0xf28ab2, 0xffd23f, 0x6fbf5a, 0xe86a6a][i], 1);
          g.fillCircle(b.x - 6 + i * 3, b.y - 8 - (i % 2) * 2, 2.4);
        }
      }
    }
  }

  // Bancs dans les parcs et le long de la Seine
  const benchTiles = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[y][x];
    if (t.walk && t.ground === 'grass' && !t.deco && (x + y * 3) % 7 === 0) benchTiles.push({ x, y });
    // quelques bancs aussi sur les places pavées
    else if (t.walk && t.ground === 'cobble' && (x * 5 + y) % 13 === 0) benchTiles.push({ x, y });
  }
  for (const { x, y } of benchTiles.slice(0, 14)) {
    spots.benches.push({ x, y });
    const b = toScreen(x, y);
    const g = add(x, y);
    isoBox(g, b.x, b.y, 0.5, 0.16, 2, { top: 0xb98458, left: 0x8a5a3c, right: 0x734a32 }, 5);
    isoBox(g, b.x, b.y - 2, 0.5, 0.04, 6, { top: 0xb98458, left: 0x9c6b43, right: 0x734a32 }, 7);
    g.fillStyle(0x34323d); g.fillRect(b.x - 10, b.y - 4, 2, 5); g.fillRect(b.x + 8, b.y - 1, 2, 5);
  }

  // Terrasses devant les cafés
  for (const bd of map.buildings) {
    if (bd.type !== 'cafe') continue;
    const e = [...bd.entrances].sort((a, b) => (b.x + b.y) - (a.x + a.y))[0];
    if (!e) continue;
    const b = toScreen(e.x, e.y);
    const g = add(e.x, e.y, 3);
    for (const [dx, col] of [[-12, 0xf2e6c9], [12, 0xe86a6a]]) {
      g.fillStyle(0x000000, 0.12); g.fillEllipse(b.x + dx, b.y + 2, 16, 6);
      g.fillStyle(0x34323d); g.fillRect(b.x + dx - 0.5, b.y - 20, 1.5, 20);
      g.fillStyle(0xffffff); g.fillEllipse(b.x + dx, b.y - 6, 12, 5);
      g.fillStyle(col); g.fillTriangle(b.x + dx - 13, b.y - 18, b.x + dx + 13, b.y - 18, b.x + dx, b.y - 27);
      g.fillStyle(shade(col, 0.85)); g.fillRect(b.x + dx - 13, b.y - 19, 26, 2);
    }
  }
  return spots;
}

// Feuillage selon la saison : cerisiers en fleurs au printemps, vert profond l'été, roux l'automne, nu l'hiver
const SEASON_LEAVES = {
  ete: () => [0x2f8a3e, 0x3f9a4a, 0x63c25c],
  automne: k => [[0xc8562b, 0xe07a35, 0xf2b84a], [0xd99a2b, 0xe8b83a, 0xf6d36b], [0xa8442a, 0xc9603a, 0xe89a52]][((k % 3) + 3) % 3],
};
export function drawTree(g, x, y, blossom = false, season = 'printemps') {
  g.fillStyle(0x000000, 0.18); g.fillEllipse(x + 4, y + 3, 30, 11);
  g.fillStyle(0x7a4b2a); g.fillRect(x - 2, y - 16, 4, 17);
  if (season === 'hiver') {
    // branches nues (+ un peu de neige posée)
    g.lineStyle(2, 0x6b4226, 1);
    g.lineBetween(x, y - 14, x - 9, y - 27); g.lineBetween(x, y - 16, x + 8, y - 29); g.lineBetween(x, y - 15, x + 1, y - 34);
    g.lineStyle(1, 0x6b4226, 1);
    g.lineBetween(x - 6, y - 23, x - 12, y - 25); g.lineBetween(x + 5, y - 25, x + 11, y - 24); g.lineBetween(x + 1, y - 28, x - 4, y - 33);
    g.fillStyle(0xffffff, 0.9); g.fillEllipse(x - 9, y - 28, 5, 2); g.fillEllipse(x + 8, y - 30, 5, 2); g.fillEllipse(x + 1, y - 35, 4, 2);
    return;
  }
  const leaf = season === 'ete' ? SEASON_LEAVES.ete()
    : season === 'automne' ? SEASON_LEAVES.automne(Math.round(x * 7 + y * 3))
      : blossom ? [0xe98fb5, 0xf4a9c8, 0xffd0e2] : [0x3f9a4a, 0x4caf50, 0x7bd36f];
  g.fillStyle(leaf[0]); g.fillCircle(x - 8, y - 20, 9); g.fillCircle(x + 8, y - 21, 9); g.fillCircle(x, y - 17, 8);
  g.fillStyle(leaf[1]); g.fillCircle(x - 3, y - 28, 11); g.fillCircle(x + 5, y - 26, 9);
  g.fillStyle(leaf[2]); g.fillCircle(x - 5, y - 32, 4); g.fillCircle(x + 6, y - 29, 3);
}

// ---------- Oiseaux : vols dans le ciel et pigeons qui picorent ----------
export function makeBirdTextures(scene) {
  const g = scene.make.graphics({ add: false });
  // vol : ailes hautes / basses
  g.fillStyle(0x3d3a4a); g.fillTriangle(0, 2, 6, 5, 6, 7); g.fillTriangle(12, 2, 6, 5, 6, 7); g.fillRect(5, 5, 2, 3);
  g.generateTexture('bird_0', 12, 9);
  g.clear(); g.fillStyle(0x3d3a4a); g.fillTriangle(0, 8, 6, 4, 6, 6); g.fillTriangle(12, 8, 6, 4, 6, 6); g.fillRect(5, 4, 2, 3);
  g.generateTexture('bird_1', 12, 9);
  // pigeon posé (gris, cou irisé)
  g.clear();
  g.fillStyle(0x000000, 0.18); g.fillEllipse(6, 10, 9, 3);
  g.fillStyle(0x8f96a3); g.fillEllipse(6, 6, 9, 6);
  g.fillStyle(0x6f7584); g.fillEllipse(4, 6, 5, 4);
  g.fillStyle(0x6b8f86); g.fillCircle(10, 4, 2.4);
  g.fillStyle(0x8f96a3); g.fillCircle(11, 3, 2);
  g.fillStyle(0xf2a33a); g.fillRect(13, 3, 2, 1);
  g.fillStyle(0xd2694a); g.fillRect(5, 9, 1, 2); g.fillRect(8, 9, 1, 2);
  g.generateTexture('pigeon', 16, 12);
  g.destroy();
  for (const k of ['bird_0', 'bird_1', 'pigeon']) scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export class Birds {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.flocks = [];
    this.nextFlock = 2000;
    this.time = 0;
    // Pigeons sur les places et dans les parcs
    const spots = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y][x];
      if (t.walk && (t.ground === 'grass' || t.ground === 'pave')) spots.push({ x, y });
    }
    const r = rng(777);
    this.spots = spots;
    this.pigeons = [];
    for (let i = 0; i < 10; i++) {
      const s = spots[Math.floor(r() * spots.length)];
      const p = { x: s.x + (r() - 0.5) * 0.6, y: s.y + (r() - 0.5) * 0.6, hop: r() * 3000, peck: 0, flying: 0, spr: scene.add.image(0, 0, 'pigeon').setOrigin(0.5, 0.9).setScale(1.2) };
      p.spr.setFlipX(r() < 0.5);
      this.pigeons.push(p);
    }
  }

  update(dt, actors) {
    this.time += dt;
    const sc = this.scene;
    // Nouvelle volée de temps en temps
    this.nextFlock -= dt;
    if (this.nextFlock <= 0) {
      this.nextFlock = 9000 + Math.random() * 14000;
      const cam = sc.cameras.main, wv = cam.worldView;
      const fromLeft = Math.random() < 0.5;
      const y0 = wv.y + wv.height * (0.15 + Math.random() * 0.3);
      const n = 3 + Math.floor(Math.random() * 4);
      const birds = [];
      for (let i = 0; i < n; i++) {
        birds.push({ dx: -i * 14 * (fromLeft ? 1 : -1), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8, phase: Math.random() * 400, spr: sc.add.image(0, 0, 'bird_0').setDepth(150000).setScale(1.4) });
      }
      this.flocks.push({ x: fromLeft ? wv.x - 40 : wv.right + 40, y: y0, vx: (fromLeft ? 1 : -1) * (0.06 + Math.random() * 0.03), birds, life: 0 });
    }
    for (const f of this.flocks) {
      f.x += f.vx * dt; f.y += Math.sin((f.life += dt) / 900) * 0.04 * dt;
      for (const b of f.birds) {
        b.spr.setPosition(f.x + b.dx, f.y + b.dy).setTexture(((this.time + b.phase) % 360) < 180 ? 'bird_0' : 'bird_1').setFlipX(f.vx < 0)
          .setTint(sc.nightTint || 0xffffff);
      }
    }
    this.flocks = this.flocks.filter(f => {
      const wv = sc.cameras.main.worldView;
      const gone = f.vx > 0 ? f.x - 120 > wv.right : f.x + 120 < wv.x;
      if (gone) f.birds.forEach(b => b.spr.destroy());
      return !gone;
    });

    // Pigeons : picorent, sautillent, s'envolent quand quelqu'un passe tout près
    for (const p of this.pigeons) {
      if (p.flying > 0) {
        p.flying -= dt;
        p.fy -= dt * 0.12; p.fx += p.fvx * dt;
        p.spr.setPosition(p.fx, p.fy).setTexture((this.time % 300) < 150 ? 'bird_0' : 'bird_1').setDepth(150000).setAlpha(Math.min(1, p.flying / 600));
        if (p.flying <= 0) { // se repose ailleurs
          const s = this.spots[Math.floor(Math.random() * this.spots.length)];
          p.x = s.x + (Math.random() - 0.5) * 0.6; p.y = s.y + (Math.random() - 0.5) * 0.6;
          p.spr.setTexture('pigeon').setAlpha(1);
        }
        continue;
      }
      const scared = actors.some(a => a.outdoors && Math.hypot(a.px - p.x, a.py - p.y) < 0.9);
      if (scared) {
        const s = toScreen(p.x, p.y);
        p.flying = 1800; p.fx = s.x; p.fy = s.y - 6; p.fvx = (Math.random() < 0.5 ? -1 : 1) * 0.08;
        continue;
      }
      p.hop -= dt;
      if (p.hop <= 0) {
        p.hop = 1500 + Math.random() * 3000;
        p.x += (Math.random() - 0.5) * 0.3; p.y += (Math.random() - 0.5) * 0.3;
        p.spr.setFlipX(Math.random() < 0.5);
        p.peck = 300;
      }
      p.peck = Math.max(0, p.peck - dt);
      const s = toScreen(p.x, p.y);
      p.spr.setPosition(s.x, s.y + (p.peck > 0 ? 1 : 0)).setAngle(p.peck > 0 ? 18 * (p.spr.flipX ? -1 : 1) : 0).setDepth(depthAt(p.x, p.y) + 3)
        .setTint(sc.nightTint || 0xffffff);
    }
  }
}

// ---------- Voitures (décor animé) ----------
const CAR_COLORS = [0xd8504d, 0x5b8def, 0xffffff, 0x3fae73, 0xf2c94c, 0x333a4a];

export function makeCarTextures(scene) {
  CAR_COLORS.forEach((c, i) => {
    const g = scene.make.graphics({ add: false });
    const cx = 36, cy = 34;
    g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy + 3, 46, 16);
    for (const [dx, dy] of [[-0.26, 0.18], [0.26, 0.18], [0.26, -0.18], [-0.26, -0.18]]) {
      g.fillStyle(0x1e1e24); g.fillEllipse(cx + (dx - dy) * HW, cy + (dx + dy) * HH - 2, 7, 5);
    }
    isoBox(g, cx, cy, 0.8, 0.42, 8, c, 3);
    isoBox(g, cx - 2, cy - 1, 0.42, 0.36, 7, { top: c, left: 0x2f4a6b, right: 0x3b5b80 }, 11);
    g.fillStyle(0xfff3c4); g.fillCircle(cx + 0.4 * HW + 2, cy + 0.4 * HH - 6, 1.6);
    g.generateTexture(`car_${i}`, 72, 52);
    g.destroy();
  });
}

// Combien de voitures / de passants selon l'heure (heures de pointe, nuit calme)
export function cityPulse(hour) {
  if (hour < 5.5) return 0.15;
  if (hour < 7) return 0.4;
  if (hour < 9.5) return 1;      // pointe du matin
  if (hour < 12) return 0.6;
  if (hour < 14) return 0.85;    // déjeuner
  if (hour < 17) return 0.6;
  if (hour < 19.5) return 1;     // pointe du soir
  if (hour < 22) return 0.55;
  return 0.3;
}

// Voitures qui suivent le réseau de rues : virages, baïonnettes, carrefours ; elles entrent et sortent par les bords.
export class Traffic {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.cars = [];
    this.road = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.tiles[y][x].ground === 'road';
    // Entrées : rues qui touchent le bord de la carte
    this.gates = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!this.road(x, y)) continue;
      const dir = x === 0 ? [1, 0] : x === map.w - 1 ? [-1, 0] : y === map.h - 1 ? [0, -1] : y === 0 ? [0, 1] : null;
      if (dir) this.gates.push({ x, y, dir });
    }
    this.max = 18;
    this.spawnIn = 0;
    this.r = rng(4242);
    // Quelques voitures déjà en route au chargement
    for (let i = 0; i < 8; i++) this.spawn(true);
  }

  spawn(midway = false) {
    if (!this.gates.length) return;
    const r = this.r;
    const gate = this.gates[Math.floor(r() * this.gates.length)];
    const spr = this.scene.add.image(0, 0, `car_${Math.floor(r() * CAR_COLORS.length)}`).setOrigin(0.5, 0.65).setAlpha(0);
    const c = { spr, x: gate.x, y: gate.y, dir: gate.dir, prevDir: gate.dir, t: 0, speed: 1.5 + r() * 1.1, life: 0, leaving: false };
    c.next = this.pickNext(c);
    if (midway) for (let k = Math.floor(r() * 12); k > 0 && c.next; k--) this.advance(c); // déjà plus loin dans la rue
    if (!c.next) { spr.destroy(); return; }
    this.cars.push(c);
  }

  // Prochaine case de rue : tout droit de préférence, sinon on tourne (jamais demi-tour)
  pickNext(c) {
    const [dx, dy] = c.dir;
    const opts = [[dx, dy], [-dy, dx], [dy, -dx]].filter(([ax, ay]) => this.road(c.x + ax, c.y + ay));
    if (!opts.length) return null;
    const straight = opts.find(([ax, ay]) => ax === dx && ay === dy);
    const d = straight && (opts.length === 1 || this.r() < 0.6) ? straight : opts[Math.floor(this.r() * opts.length)];
    return { x: c.x + d[0], y: c.y + d[1], dir: d };
  }

  advance(c) {
    c.x = c.next.x; c.y = c.next.y; c.prevDir = c.dir; c.dir = c.next.dir; c.t = 0;
    c.next = this.pickNext(c);
  }

  // Position à l'écran : sur la file de droite, avec un virage adouci
  posOf(c) {
    const off = 0.22;
    const lane = d => [-d[1] * off, d[0] * off];
    const k = Math.min(1, c.t / 0.5);
    const l0 = lane(c.prevDir), l1 = lane(c.dir);
    const nx = c.next ? c.next.x : c.x + c.dir[0], ny = c.next ? c.next.y : c.y + c.dir[1];
    return {
      x: c.x + (nx - c.x) * c.t + l0[0] + (l1[0] - l0[0]) * k,
      y: c.y + (ny - c.y) * c.t + l0[1] + (l1[1] - l0[1]) * k,
    };
  }

  update(dt, hour = 12) {
    const target = Math.round(this.max * cityPulse(hour));
    this.spawnIn -= dt;
    if (this.cars.length < target && this.spawnIn <= 0) { this.spawn(); this.spawnIn = 900 + Math.random() * 1500; }
    const tint = this.scene.nightTint || 0xffffff;
    for (const c of this.cars) {
      c.life += dt;
      const p = this.posOf(c);
      // On freine derrière la voiture de devant (même file, même sens)
      const blocked = this.cars.some(o => o !== c && o.dir[0] === c.dir[0] && o.dir[1] === c.dir[1] && (() => {
        const q = this.posOf(o);
        const ax = (q.x - p.x) * c.dir[0] + (q.y - p.y) * c.dir[1];
        const side = Math.abs((q.x - p.x) * c.dir[1] - (q.y - p.y) * c.dir[0]);
        return ax > 0 && ax < 0.85 && side < 0.3;
      })());
      if (!blocked || c.leaving) c.t += c.speed * dt / 1000;
      while (c.t >= 1 && !c.leaving) {
        if (c.next) this.advance(c);
        if (!c.next) { c.leaving = true; c.t = 0; } // bord de la carte : la voiture sort en s'effaçant
      }
      const q = this.posOf(c);
      const fadeIn = Math.min(1, c.life / 600);
      const fadeOut = c.leaving ? Math.max(0, 1 - c.t) : 1;
      const s = toScreen(q.x, q.y);
      // La texture est orientée le long de x ; en miroir, elle suit l'axe y
      c.spr.setPosition(s.x, s.y).setDepth(depthAt(q.x, q.y) + 4)
        .setFlipX(c.dir[1] !== 0).setAlpha(Math.min(fadeIn, fadeOut)).setTint(tint);
    }
    // Voitures sorties de la carte
    this.cars = this.cars.filter(c => {
      if (c.leaving && c.t >= 1) { c.spr.destroy(); return false; }
      return true;
    });
  }
}

// ---------- Passants : des gens de passage qui traversent le quartier (décor, plus nombreux aux heures de pointe) ----------
export class Crowd {
  constructor(scene, map, makeLook, ensureTex) {
    this.scene = scene;
    this.map = map;
    this.makeLook = makeLook;
    this.ensureTex = ensureTex;
    this.people = [];
    this.max = 14;
    this.spawnIn = 0;
    this.n = 0;
    // Entrées / sorties : bords de la carte côté trottoir et bouche de métro
    this.gates = map.footpaths.filter(p => p.x === 0 || p.y === map.h - 1 || p.x === map.w - 1);
    const metro = map.buildings.find(b => b.type === 'metro');
    if (metro) for (const e of metro.entrances) this.gates.push(e, e);
  }

  spawn(findPath) {
    const g = this.gates[Math.floor(Math.random() * this.gates.length)];
    let to = this.gates[Math.floor(Math.random() * this.gates.length)];
    // un détour par le quartier (place, parc, vitrine) de temps en temps
    const via = Math.random() < 0.6 ? this.map.randomFootpath() : null;
    const leg1 = findPath(this.map, g, (x, y) => (via ? x === via.x && y === via.y : x === to.x && y === to.y));
    if (!leg1) return;
    let path = leg1.path;
    if (via) {
      const leg2 = findPath(this.map, via, (x, y) => x === to.x && y === to.y);
      if (!leg2) return;
      path = path.concat(leg2.path);
    }
    if (path.length < 6) return;
    // On réutilise un petit nombre de textures : un numéro libre, recréé avec une nouvelle apparence
    const used = new Set(this.people.map(p => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const id = `pass${slot}`;
    const fake = { id, look: this.makeLook() };
    const key = `char_${id}_0`;
    for (const s of ['', '_1', '_2', '_i', '_b0', '_b1', '_b2']) if (this.scene.textures.exists(key + s)) this.scene.textures.remove(key + s);
    this.ensureTex(this.scene, fake);
    const spr = this.scene.add.image(0, 0, fake.texKey).setOrigin(0.5, 0.93).setScale(1.5).setAlpha(0);
    this.people.push({ spr, slot, key: fake.texKey, x: g.x, y: g.y, path, speed: 1.1 + Math.random() * 0.5, life: 0, facing: 1, pause: 0 });
  }

  update(dt, hour, findPath, paused, weather = 'sun') {
    // moins de monde dehors sous la pluie ou la neige
    const target = Math.round(this.max * cityPulse(hour) * (weather === 'rain' || weather === 'snow' ? 0.4 : 1));
    this.spawnIn -= dt;
    if (!paused && this.people.length < target && this.spawnIn <= 0) { this.spawn(findPath); this.spawnIn = 700 + Math.random() * 1400; }
    const tint = this.scene.nightTint || 0xffffff;
    const now = this.scene.time.now;
    for (const p of this.people) {
      if (!paused) {
        p.life += dt;
        if (p.pause > 0) p.pause -= dt;
        else {
          let budget = p.speed * dt / 1000;
          while (budget > 0 && p.path.length) {
            const t = p.path[0];
            const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
            if (Math.abs(dx - dy) > 0.01) p.facing = dx - dy > 0 ? 1 : -1;
            if (Math.abs(dx + dy) > 0.01) p.away = dx + dy < 0;
            if (d <= budget) { p.x = t.x; p.y = t.y; p.path.shift(); budget -= d; if (Math.random() < 0.01) p.pause = 1500 + Math.random() * 2500; }
            else { p.x += dx / d * budget; p.y += dy / d * budget; budget = 0; }
          }
        }
      }
      const s = toScreen(p.x, p.y);
      const walking = p.path.length && p.pause <= 0 && !paused;
      const st = Math.floor(now / 170) % 2 ? 1 : 2;
      const key = walking ? `${p.key}${p.away ? `_b${st}` : `_${st}`}` : p.key;
      const fade = Math.min(1, p.life / 500, p.path.length ? 1 : 0);
      p.spr.setTexture(key).setPosition(s.x, s.y - (walking ? Math.abs(Math.sin(now * 0.0185)) * 1.5 : 0))
        .setDepth(depthAt(p.x, p.y) + 5).setFlipX(p.facing < 0).setAlpha(fade).setTint(tint);
    }
    this.people = this.people.filter(p => { if (!p.path.length) { p.spr.destroy(); return false; } return true; });
  }
}
