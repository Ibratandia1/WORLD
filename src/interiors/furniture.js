import { TW, TH, toScreen } from '../iso.js';
import { shade } from '../color.js';

// Point écran d'une position de grille (x, y) à une hauteur z (pixels).
export const P = (x, y, z = 0) => { const s = toScreen(x, y); return { x: s.x, y: s.y - z }; };

// Rectangle sur un plan vertical y = cste (mur du fond droit) ou x = cste (mur du fond gauche).
export const planeY = (y, x1, x2, z1, z2) => [P(x1, y, z2), P(x2, y, z2), P(x2, y, z1), P(x1, y, z1)];
export const planeX = (x, y1, y2, z1, z2) => [P(x, y1, z2), P(x, y2, z2), P(x, y2, z1), P(x, y1, z1)];

export function quad(g, pts, color, alpha = 1) { g.fillStyle(color, alpha); g.fillPoints(pts, true); }

// Bloc isométrique centré en (x, y) — fw/fd en fraction de case, h et z0 en pixels.
export function block(g, x, y, fw, fd, h, color, z0 = 0, alpha = 1) {
  const c = toScreen(x, y);
  const pt = (dx, dy, z) => ({ x: c.x + (dx - dy) * TW / 2, y: c.y + (dx + dy) * TH / 2 - z });
  const a = fw / 2, d = fd / 2, z1 = z0 + h;
  const col = typeof color === 'object' ? color : { top: color, left: shade(color, 0.86), right: shade(color, 0.72) };
  g.fillStyle(col.left, alpha); g.fillPoints([pt(-a, d, z1), pt(a, d, z1), pt(a, d, z0), pt(-a, d, z0)], true);
  g.fillStyle(col.right, alpha); g.fillPoints([pt(a, d, z1), pt(a, -d, z1), pt(a, -d, z0), pt(a, d, z0)], true);
  g.fillStyle(col.top, alpha); g.fillPoints([pt(-a, -d, z1), pt(a, -d, z1), pt(a, d, z1), pt(-a, d, z1)], true);
}

const WOOD = { top: 0xd9b48a, left: 0x8a5a3c, right: 0x734a32 };
const PRODUCTS = [0xe8504d, 0xf2c94c, 0x5b8def, 0x4bbf8b, 0xf08a3c, 0x9b6ee8, 0xffffff];

function foliage(g, x, y, base, big = false) {
  const s = toScreen(x, y);
  const k = big ? 1.4 : 1;
  g.fillStyle(0x3f9a4a); g.fillCircle(s.x - 5 * k, s.y - base - 5 * k, 7 * k); g.fillCircle(s.x + 5 * k, s.y - base - 6 * k, 7 * k);
  g.fillStyle(0x4caf50); g.fillCircle(s.x, s.y - base - 12 * k, 8 * k);
  g.fillStyle(0x7bd36f); g.fillCircle(s.x - 3 * k, s.y - base - 15 * k, 3 * k);
}

// Objets posés au sol. Chaque fonction reçoit (g, x, y, item).
export const FLOOR_ITEMS = {
  desk(g, x, y) {
    block(g, x - 0.38, y + 0.18, 0.06, 0.06, 13, 0x8a8f99);
    block(g, x + 0.38, y + 0.18, 0.06, 0.06, 13, 0x8a8f99);
    block(g, x, y, 0.92, 0.56, 3, { top: 0xf6f3ec, left: 0xdcd6ca, right: 0xc9c2b4 }, 12);
    block(g, x, y - 0.1, 0.08, 0.06, 4, 0x2b2f3a, 15);
    block(g, x, y - 0.12, 0.44, 0.05, 13, { top: 0x2b2f3a, left: 0x7fd0ff, right: 0x2b2f3a }, 19);
    block(g, x, y + 0.12, 0.32, 0.1, 1, 0xd0d4dc, 15);
    block(g, x + 0.32, y + 0.1, 0.07, 0.07, 4, 0xffffff, 15);
    block(g, x - 0.33, y - 0.05, 0.12, 0.16, 2, 0xf2c94c, 15);
  },
  chair(g, x, y, it) {
    const c = it.c || 0x3d4a6b;
    block(g, x, y, 0.08, 0.08, 6, 0x555b66);
    block(g, x, y, 0.34, 0.34, 3, c, 6);
    block(g, x, y + 0.16, 0.34, 0.06, 10, shade(c, 1.1), 9);
  },
  stool(g, x, y) { block(g, x, y, 0.08, 0.08, 8, 0x555b66); block(g, x, y, 0.28, 0.28, 3, 0x8a5a3c, 8); },
  plant(g, x, y) { block(g, x, y, 0.3, 0.3, 10, 0xc96f3b); foliage(g, x, y, 10); },
  bigplant(g, x, y) { block(g, x, y, 0.38, 0.38, 14, 0xb85f30); foliage(g, x, y, 20, true); },
  meeting(g, x, y) {
    block(g, x, y, 1.7, 0.95, 13, { top: 0xb98458, left: 0x8a5a3c, right: 0x734a32 });
    block(g, x - 0.45, y, 0.3, 0.2, 2, 0x333a4a, 13);
    block(g, x + 0.4, y + 0.1, 0.3, 0.2, 2, 0xc9ced8, 13);
    block(g, x, y - 0.25, 0.2, 0.12, 1, 0xffffff, 13);
  },
  counter(g, x, y) { block(g, x, y, 1, 0.6, 18, WOOD); },
  coffee(g, x, y) {
    block(g, x, y, 0.32, 0.28, 13, { top: 0x4a4a55, left: 0x3a3a44, right: 0x2e2e36 }, 18);
    block(g, x, y + 0.1, 0.1, 0.06, 3, 0xe8504d, 26);
  },
  register(g, x, y) {
    block(g, x, y, 0.3, 0.25, 6, 0x4a4a55, 18);
    block(g, x, y - 0.05, 0.22, 0.04, 6, { top: 0x2b2f3a, left: 0x8fe39a, right: 0x2b2f3a }, 24);
  },
  cakes(g, x, y) {
    block(g, x, y, 0.5, 0.35, 2, 0xffffff, 18);
    block(g, x - 0.1, y, 0.12, 0.12, 4, 0xe86a8c, 20); block(g, x + 0.12, y, 0.12, 0.12, 4, 0xa0522d, 20);
    block(g, x, y, 0.5, 0.35, 10, { top: 0xe8f6ff, left: 0xcfeeff, right: 0xbfe3f7 }, 20, 0.5);
  },
  tablec(g, x, y) {
    block(g, x, y, 0.08, 0.08, 10, 0x333a4a);
    block(g, x, y, 0.6, 0.6, 2, 0xffffff, 10);
    block(g, x + 0.1, y, 0.08, 0.08, 4, 0xf0e6d8, 12);
  },
  sofa(g, x, y, it) {
    const c = it.c || 0x5b8def;
    block(g, x, y - 0.22, 0.95, 0.14, 16, shade(c, 0.9));
    block(g, x, y + 0.05, 0.95, 0.45, 8, c);
    block(g, x - 0.43, y + 0.03, 0.1, 0.5, 12, shade(c, 0.95));
    block(g, x + 0.43, y + 0.03, 0.1, 0.5, 12, shade(c, 0.95));
  },
  tvstand(g, x, y) { block(g, x, y, 0.9, 0.32, 10, WOOD); block(g, x - 0.25, y, 0.15, 0.15, 6, 0x333a4a, 10); },
  bed(g, x, y, it) {
    block(g, x, y - 0.44, 0.92, 0.07, 22, 0x8a5a3c);
    block(g, x, y + 0.04, 0.86, 0.9, 9, 0xffffff);
    block(g, x, y - 0.28, 0.6, 0.2, 4, 0xf6f6f6, 9);
    block(g, x, y + 0.16, 0.88, 0.66, 2, it.c || 0x7b5cf0, 9);
  },
  nightstand(g, x, y) {
    block(g, x, y, 0.4, 0.4, 11, WOOD);
    block(g, x, y, 0.06, 0.06, 8, 0x555555, 11);
    block(g, x, y, 0.2, 0.2, 7, { top: 0xfff2c4, left: 0xffe08a, right: 0xf2cf6b }, 19);
  },
  wardrobe(g, x, y) {
    block(g, x, y, 0.85, 0.45, 42, { top: 0xc9986a, left: 0xb98458, right: 0x9c6b43 });
    quad(g, [P(x, y + 0.225, 40), P(x, y + 0.225, 40), P(x, y + 0.225, 4), P(x, y + 0.225, 4)], 0x6b4a2f);
    block(g, x - 0.06, y + 0.23, 0.04, 0.02, 6, 0xf2c94c, 20); block(g, x + 0.06, y + 0.23, 0.04, 0.02, 6, 0xf2c94c, 20);
  },
  rug(g, x, y, it) { block(g, x, y, it.w || 1.6, it.d || 1.1, 1, it.c || 0xe86a8c); },
  bookshelf(g, x, y) {
    block(g, x, y, 0.9, 0.36, 38, { top: 0xb98458, left: 0x9c6b43, right: 0x734a32 });
    for (const z of [6, 18, 30]) for (let i = 0; i < 5; i++) {
      block(g, x - 0.34 + i * 0.17, y + 0.13, 0.12, 0.1, 8, PRODUCTS[(i + z) % PRODUCTS.length], z);
    }
  },
  fridge(g, x, y) {
    block(g, x, y, 0.62, 0.56, 34, { top: 0xffffff, left: 0xf2f4f7, right: 0xd9dde3 });
    block(g, x - 0.2, y + 0.29, 0.03, 0.02, 10, 0x9aa0aa, 18);
  },
  kitchen(g, x, y, it) {
    block(g, x, y, 0.95, 0.62, 15, { top: 0xd8d2c6, left: 0xffffff, right: 0xe5e5e5 });
    if (it.stove) {
      for (const [dx, dy] of [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.12], [0.2, 0.12]]) block(g, x + dx, y + dy, 0.16, 0.12, 1, 0x333333, 15);
    } else {
      block(g, x, y, 0.4, 0.3, 1, 0x9fb7c9, 15);
      block(g, x, y - 0.2, 0.05, 0.05, 6, 0xaaaaaa, 15);
    }
  },
  tableh(g, x, y) {
    block(g, x - 0.3, y, 0.06, 0.06, 11, 0x8a5a3c); block(g, x + 0.3, y, 0.06, 0.06, 11, 0x8a5a3c);
    block(g, x, y, 0.8, 0.6, 2, { top: 0xc9986a, left: 0xb98458, right: 0x9c6b43 }, 11);
    block(g, x, y, 0.16, 0.16, 2, 0xffffff, 13);
  },
  shelf(g, x, y) {
    block(g, x, y, 0.95, 0.45, 28, { top: 0xf2ebdd, left: 0xe8dcc6, right: 0xd2c4aa });
    for (const z of [3, 11, 19]) for (let i = 0; i < 4; i++) {
      block(g, x - 0.33 + i * 0.22, y + 0.16, 0.15, 0.1, 6, PRODUCTS[(i * 3 + z + Math.round(x)) % PRODUCTS.length], z);
    }
  },
  fridgeglass(g, x, y) {
    block(g, x, y, 0.92, 0.5, 32, { top: 0xdfe9f2, left: 0x9fd4f5, right: 0xc7d6e2 });
    for (const z of [6, 16, 26]) block(g, x, y + 0.2, 0.8, 0.06, 2, 0xffffff, z);
  },
  display(g, x, y) {
    block(g, x, y, 0.95, 0.56, 12, WOOD);
    block(g, x - 0.22, y, 0.22, 0.14, 4, 0xc68642, 12); block(g, x + 0.12, y - 0.05, 0.22, 0.12, 4, 0xa0522d, 12);
    block(g, x + 0.3, y + 0.08, 0.14, 0.14, 4, 0xe8b04a, 12);
    block(g, x, y, 0.95, 0.56, 10, { top: 0xe8f6ff, left: 0xcfeeff, right: 0xbfe3f7 }, 12, 0.45);
  },
  breadshelf(g, x, y) {
    block(g, x, y, 0.9, 0.4, 34, { top: 0xb98458, left: 0x9c6b43, right: 0x734a32 });
    for (const z of [6, 16, 26]) for (let i = 0; i < 3; i++) block(g, x - 0.25 + i * 0.25, y + 0.15, 0.2, 0.1, 5, i % 2 ? 0xc68642 : 0xe8b04a, z);
  },
  oven(g, x, y) {
    block(g, x, y, 0.92, 0.7, 32, { top: 0x8a8a8a, left: 0xa9a9a9, right: 0x8f8f8f });
    quad(g, planeY(y + 0.351, x - 0.25, x + 0.25, 8, 20), 0xff8a3c);
    quad(g, planeY(y + 0.352, x - 0.18, x + 0.18, 10, 16), 0xffd23f);
  },
  sacks(g, x, y) {
    block(g, x - 0.15, y, 0.3, 0.3, 12, 0xe8dcc0); block(g, x + 0.17, y + 0.05, 0.28, 0.28, 10, 0xdccfae);
    block(g, x, y - 0.2, 0.28, 0.28, 9, 0xe8dcc0, 12);
  },
  worktable(g, x, y) {
    block(g, x, y, 0.9, 0.6, 13, { top: 0xe8dcc6, left: 0xb98458, right: 0x9c6b43 });
    block(g, x, y, 0.3, 0.25, 3, 0xfff8ec, 13);
  },
  vending(g, x, y) {
    block(g, x, y, 0.6, 0.5, 34, { top: 0xe86a6a, left: 0xd9504d, right: 0xb8403e });
    quad(g, planeY(y + 0.251, x - 0.22, x + 0.12, 10, 30), 0xcfeeff);
  },
  cooler(g, x, y) {
    block(g, x, y, 0.3, 0.3, 15, 0xffffff);
    block(g, x, y, 0.2, 0.2, 10, 0x7fc8ff, 15, 0.85);
  },
  reception(g, x, y) { block(g, x, y, 1, 0.56, 17, { top: 0xffffff, left: 0x7b5cf0, right: 0x6248c9 }); },
  ticket(g, x, y) {
    block(g, x, y, 0.46, 0.36, 24, { top: 0x3e9b70, left: 0x2f7d5b, right: 0x25654a });
    quad(g, planeY(y + 0.181, x - 0.12, x + 0.12, 14, 20), 0x9fe3c2);
  },
  gate(g, x, y) { block(g, x - 0.3, y, 0.12, 0.7, 13, 0x9aa0aa); block(g, x + 0.3, y, 0.12, 0.7, 13, 0x9aa0aa); },
  stairs(g, x, y) {
    block(g, x, y, 1.6, 0.9, 1, 0x2b2b35);
    for (let i = 0; i < 4; i++) block(g, x - 0.6 + i * 0.4, y, 0.06, 0.9, 1, 0x55555f, 1);
  },
  // Portant de vêtements
  rack(g, x, y, it) {
    const cols = it.cols || [0xe86a8c, 0x5b8def, 0xf2c94c, 0x4bbf8b, 0x9b6ee8];
    block(g, x - 0.4, y, 0.05, 0.05, 30, 0x34323d); block(g, x + 0.4, y, 0.05, 0.05, 30, 0x34323d);
    block(g, x, y, 0.85, 0.04, 2, 0x34323d, 29);
    cols.forEach((c, i) => block(g, x - 0.34 + i * 0.17, y, 0.13, 0.22, 17, c, 11));
  },
  // Table de présentation (vêtements pliés)
  foldtable(g, x, y) {
    block(g, x, y, 0.8, 0.5, 12, { top: 0xf2ebdd, left: 0xd2c4aa, right: 0xb9a98c });
    [0x2b3a6b, 0xe86a8c, 0xf6f6f6].forEach((c, i) => block(g, x - 0.22 + i * 0.22, y, 0.18, 0.2, 4, c, 12));
  },
  fitting(g, x, y) {
    block(g, x, y - 0.4, 0.9, 0.06, 40, 0xd8c3a5);
    block(g, x, y, 0.9, 0.06, 36, 0xb8403e, 4);
  },
  // Vélo exposé
  bike(g, x, y, it) {
    const s = P(x, y);
    const c = it.c || 0x2f7d5b;
    g.lineStyle(2, 0x222222, 1);
    g.strokeCircle(s.x - 8, s.y - 6, 6); g.strokeCircle(s.x + 8, s.y - 2, 6);
    g.lineStyle(2, c, 1);
    g.lineBetween(s.x - 8, s.y - 6, s.x, s.y - 12); g.lineBetween(s.x, s.y - 12, s.x + 8, s.y - 2);
    g.lineBetween(s.x - 8, s.y - 6, s.x + 2, s.y - 4); g.lineBetween(s.x + 2, s.y - 4, s.x + 8, s.y - 2);
    g.lineBetween(s.x, s.y - 12, s.x - 1, s.y - 16); g.lineBetween(s.x + 6, s.y - 14, s.x + 8, s.y - 2);
    g.fillStyle(0x222222); g.fillRect(s.x - 3, s.y - 17, 5, 2); g.fillRect(s.x + 4, s.y - 15, 5, 2);
  },
  // Voiture sur le pont élévateur
  carshow(g, x, y, it) {
    const c = it.c || 0xd8504d;
    block(g, x, y, 1.6, 0.9, 3, 0x8f96a3);
    block(g, x, y, 1.3, 0.62, 10, c, 6);
    block(g, x - 0.05, y, 0.7, 0.52, 9, { top: c, left: 0x2f4a6b, right: 0x3b5b80 }, 16);
    for (const [dx, dy] of [[-0.45, 0.3], [0.45, 0.3], [0.45, -0.3], [-0.45, -0.3]]) block(g, x + dx, y + dy, 0.18, 0.08, 6, 0x1e1e24, 4);
  },
  tires(g, x, y) {
    for (let i = 0; i < 3; i++) block(g, x, y, 0.36, 0.36, 5, 0x2b2b30, i * 5.5);
  },
  workbench(g, x, y) {
    block(g, x, y, 0.95, 0.5, 14, { top: 0x9c6b43, left: 0x6b4226, right: 0x55341e });
    block(g, x - 0.2, y, 0.2, 0.14, 4, 0xb8403e, 14); block(g, x + 0.2, y, 0.1, 0.1, 6, 0x8f96a3, 14);
  },
  // Escalier qui monte vers le fond
  stairs_up(g, x, y) {
    for (let i = 0; i < 5; i++) {
      block(g, x, y + 0.32 - i * 0.16, 0.9, 0.16, 5 * (i + 1), { top: 0xd9b48a, left: 0xb98458, right: 0x8a5a3c });
    }
    block(g, x + 0.44, y, 0.04, 0.9, 30, 0x34323d);
  },
  printer(g, x, y) {
    block(g, x, y, 0.55, 0.42, 12, { top: 0xe9ecf1, left: 0xc9ced8, right: 0xaab0bc });
    block(g, x, y - 0.05, 0.4, 0.28, 2, 0xffffff, 12);
    block(g, x + 0.12, y + 0.1, 0.12, 0.04, 2, 0x4bbf8b, 9);
  },
  bossdesk(g, x, y) {
    block(g, x, y, 1.4, 0.7, 15, { top: 0x8a5a3c, left: 0x6b4226, right: 0x55341e });
    block(g, x - 0.2, y - 0.12, 0.46, 0.05, 13, { top: 0x2b2f3a, left: 0x7fd0ff, right: 0x2b2f3a }, 17);
    block(g, x + 0.35, y + 0.1, 0.2, 0.14, 2, 0xffffff, 15);
    block(g, x + 0.5, y - 0.15, 0.08, 0.08, 6, 0x4caf50, 15);
  },
  armchair(g, x, y, it) {
    const c = it.c || 0x6b4226;
    block(g, x, y, 0.44, 0.42, 9, c);
    block(g, x, y - 0.18, 0.44, 0.08, 20, shade(c, 0.85));
  },
  bench(g, x, y) {
    block(g, x - 0.35, y, 0.06, 0.3, 7, 0x555b66); block(g, x + 0.35, y, 0.06, 0.3, 7, 0x555b66);
    block(g, x, y, 0.9, 0.34, 3, WOOD, 7);
  },
};

// Objets accrochés aux murs du fond : `at` = position le long du mur, `wall` = 'R' (y = -0,5) ou 'L' (x = -0,5).
export const WALL_ITEMS = {
  whiteboard(g, plane, at) {
    quad(g, plane(at - 0.6, at + 0.6, 26, 62), 0xb8bec9);
    quad(g, plane(at - 0.55, at + 0.55, 28, 60), 0xffffff);
    [0xf2c94c, 0xe86a8c, 0x5b8def, 0x4bbf8b].forEach((c, i) => quad(g, plane(at - 0.45 + i * 0.22, at - 0.33 + i * 0.22, 44, 54), c));
    quad(g, plane(at - 0.4, at + 0.2, 34, 36), 0x5b8def);
  },
  tv(g, plane, at) { quad(g, plane(at - 0.45, at + 0.45, 24, 50), 0x1d2230); quad(g, plane(at - 0.4, at + 0.4, 26, 48), 0x3b5b8f); },
  menu(g, plane, at) {
    quad(g, plane(at - 0.5, at + 0.5, 34, 64), 0x8a5a3c); quad(g, plane(at - 0.45, at + 0.45, 36, 62), 0x2f3a33);
    for (let i = 0; i < 4; i++) quad(g, plane(at - 0.35, at + 0.1 + (i % 2) * 0.15, 42 + i * 5, 43 + i * 5), 0xffffff);
  },
  frame(g, plane, at, it) { quad(g, plane(at - 0.35, at + 0.35, 34, 60), 0x8a5a3c); quad(g, plane(at - 0.3, at + 0.3, 36, 58), it.c || 0x8fd3a8); },
  cupshelf(g, plane, at) {
    quad(g, plane(at - 0.5, at + 0.5, 40, 42), 0x8a5a3c);
    for (let i = 0; i < 5; i++) quad(g, plane(at - 0.42 + i * 0.18, at - 0.32 + i * 0.18, 42, 48), 0xffffff);
  },
  metrosign(g, plane, at) {
    quad(g, plane(at - 0.7, at + 0.7, 46, 62), 0x2f7d5b);
    quad(g, plane(at - 0.62, at - 0.42, 49, 59), 0xf2c94c);
  },
  mirror(g, plane, at) {
    quad(g, plane(at - 0.25, at + 0.25, 6, 60), 0xd9b04a);
    quad(g, plane(at - 0.2, at + 0.2, 9, 57), 0xcfe6f5);
    quad(g, plane(at - 0.16, at - 0.06, 20, 50), 0xffffff);
  },
  toolwall(g, plane, at) {
    quad(g, plane(at - 0.7, at + 0.7, 26, 60), 0x8a5a3c);
    for (let i = 0; i < 6; i++) quad(g, plane(at - 0.6 + i * 0.22, at - 0.52 + i * 0.22, 32 + (i % 3) * 6, 50), [0xb8403e, 0x8f96a3, 0xf2c94c][i % 3]);
  },
  elevator(g, plane, at) {
    quad(g, plane(at - 0.42, at + 0.42, 0, 56), 0x8f96a3);
    quad(g, plane(at - 0.36, at - 0.01, 2, 50), 0xd5d9e0);
    quad(g, plane(at + 0.01, at + 0.36, 2, 50), 0xc6cbd4);
    quad(g, plane(at - 0.12, at + 0.12, 52, 55), 0xf2a33a);
  },
  mailboxes(g, plane, at) {
    quad(g, plane(at - 0.5, at + 0.5, 22, 48), 0x8a5a3c);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      quad(g, plane(at - 0.45 + c * 0.24, at - 0.25 + c * 0.24, 25 + r * 7.5, 30 + r * 7.5), 0xd9b04a);
    }
  },
  clock(g, plane, at) { quad(g, plane(at - 0.15, at + 0.15, 56, 68), 0xffffff); quad(g, plane(at - 0.01, at + 0.01, 60, 66), 0x333333); },
};

export { planeX as wallPlaneL, planeY as wallPlaneR };
