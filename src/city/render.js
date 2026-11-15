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
  g.lineStyle(1, 0x000000, 0.1);
  g.lineBetween(cx, cy + HH - h, cx, cy + HH);
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

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gr = ground(x, y);
      // Bordure entre trottoir et rue
      if (gr === 'pave' && !tiles[y][x].building) {
        for (const dy of [1, -1]) {
          if (ground(x, y + dy) !== 'road') continue;
          const yy = y + dy / 2;
          const a = P(x - 0.5, yy), b = P(x + 0.5, yy);
          g.lineStyle(4, 0xd4d7df, 1); g.lineBetween(a.x, a.y, b.x, b.y);
          g.lineStyle(1, 0x8d93a3, 1); g.lineBetween(a.x, a.y + 2, b.x, b.y + 2);
        }
      }
      // Passages piétons
      if (gr === 'road' && x % 5 === 3) {
        g.lineStyle(3, 0xffffff, 0.85);
        for (let k = 0; k < 4; k++) {
          const v = -0.36 + k * 0.24;
          const a = P(x - 0.32, y + v), b = P(x + 0.32, y + v);
          g.lineBetween(a.x, a.y, b.x, b.y);
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
export function drawStreetDecor(scene, map, lights, darks) {
  const { w, h, tiles } = map;
  const ground = (x, y) => (tiles[y] && tiles[y][x] ? tiles[y][x].ground : null);
  const r = rng(98765);
  const add = (x, y, extra = 2) => twin(scene, depthAt(x, y) + extra, darks);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      const s = toScreen(x, y);

      if (t.deco === 'tree') drawTree(add(x, y, 0), s.x, s.y, r() < 0.25);

      if (t.deco === 'fountain') {
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

      if (!t.walk || t.ground !== 'pave') continue;

      // Lampadaires le long des rues
      const roadDir = ground(x, y + 1) === 'road' ? 1 : ground(x, y - 1) === 'road' ? -1 : 0;
      if (roadDir && x % 4 === 2) {
        const px = x, py = y + roadDir * 0.36;
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
      } else if (roadDir && x % 4 === 0 && r() < 0.7) {
        // Bacs à fleurs
        const px = x + 0.1, py = y + roadDir * 0.3;
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
  }
  for (const { x, y } of benchTiles.slice(0, 8)) {
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
}

export function drawTree(g, x, y, blossom = false) {
  const leaf = blossom ? [0xe98fb5, 0xf4a9c8, 0xffd0e2] : [0x3f9a4a, 0x4caf50, 0x7bd36f];
  g.fillStyle(0x000000, 0.18); g.fillEllipse(x + 4, y + 3, 30, 11);
  g.fillStyle(0x7a4b2a); g.fillRect(x - 2, y - 16, 4, 17);
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

export class Traffic {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.cars = [];
    const roads = [];
    for (let y = 0; y < map.h; y++) if (map.tiles[y].every(t => t.ground === 'road')) roads.push(y);
    const r = rng(4242);
    for (const ry of roads) {
      for (let i = 0; i < 3; i++) {
        for (const dir of [1, -1]) {
          const spr = scene.add.image(0, 0, `car_${Math.floor(r() * CAR_COLORS.length)}`).setOrigin(0.5, 0.65);
          this.cars.push({ spr, dir, y: ry + (dir > 0 ? 0.22 : -0.22), x: r() * map.w, speed: 1.6 + r() * 1.2 });
        }
      }
    }
  }

  update(dt) {
    const w = this.map.w;
    for (const c of this.cars) {
      c.x += c.dir * c.speed * dt / 1000;
      if (c.x > w + 1) c.x = -1.5;
      if (c.x < -1.5) c.x = w + 1;
      const s = toScreen(c.x, c.y);
      const fade = Math.min(1, Math.max(0, (c.x + 1) / 1.2), Math.max(0, (w + 0.5 - c.x) / 1.2));
      c.spr.setPosition(s.x, s.y).setDepth(depthAt(c.x, c.y) + 4).setAlpha(fade).setTint(this.scene.nightTint || 0xffffff);
    }
  }
}
