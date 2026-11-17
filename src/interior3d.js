// Intérieurs en 3D (Three.js) : mêmes plans que la vue 2D (src/interiors/layouts.js), mêmes postes, mêmes actions.
// La scène 2D InteriorScene reste le « cerveau » (qui est où, quel meuble fait quoi, étages, toucher) ;
// ce module ne fait que dessiner la pièce en 3D et transmettre les touchers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { figurePose, FIGURE_MAT } from './figure3d.js';

const WALL_H = 1.7;    // hauteur des murs du fond
const LOW_H = 0.32;    // murets (cloisons et façade, coupés pour voir dedans)
const C = c => new THREE.Color(c);
// Fusion robuste : toutes les formes passent en « non indexé » (certaines formes de Three.js ne le sont pas)
const merge = list => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)));

function paint(geo, color, top = null) {
  const n = geo.attributes.position.count, cols = new Float32Array(n * 3);
  const a = C(color), b = top != null ? C(top) : a, nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const c = nrm && nrm.getY(i) > 0.9 ? b : a;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
const B = (w, h, d, x, y, z, c, top = null) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), c, top);
const CY = (r1, r2, h, x, y, z, c, seg = 12) => paint(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y + h / 2, z), c);
const SP = (r, x, y, z, c, sx = 1, sy = 1, sz = 1) => paint(new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz).translate(x, y, z), c);
const shade = (c, k) => { const o = C(c); o.multiplyScalar(k); return o.getHex(); };
const WOOD = 0x9a6a44, WOOD_L = 0xc79a6c, METAL = 0x8a8f99, DARK = 0x2b2f3a, WHITE = 0xf4f1ea;

// ---------- Meubles : chaque type → liste de géométries (fusionnées en un seul maillage) ----------
// Coordonnées locales : centre de la case, sol en y = 0. it = objet du plan (couleur it.c, etc.)
const FURN = {
  desk: it => [B(0.9, 0.04, 0.55, 0, 0.36, 0, WHITE), ...[[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]].map(([x, z]) => B(0.04, 0.36, 0.04, x, 0, z, METAL)), B(0.36, 0.24, 0.03, 0, 0.4, -0.15, DARK), B(0.32, 0.2, 0.01, 0, 0.42, -0.135, 0x7fd0ff), B(0.3, 0.02, 0.1, 0, 0.4, 0.08, 0xd0d4dc)],
  chair: it => [B(0.34, 0.04, 0.34, 0, 0.22, 0, it.c || 0x3d4a6b), B(0.34, 0.3, 0.04, 0, 0.26, 0.15, it.c || 0x3d4a6b), CY(0.025, 0.025, 0.22, 0, 0, 0, 0x555b66, 6)],
  stool: () => [CY(0.15, 0.15, 0.04, 0, 0.32, 0, WOOD), CY(0.03, 0.03, 0.32, 0, 0, 0, 0x555b66, 6)],
  plant: () => [CY(0.13, 0.1, 0.22, 0, 0, 0, 0xc96f3b), SP(0.2, 0, 0.36, 0, 0x4caf50)],
  bigplant: () => [CY(0.17, 0.13, 0.3, 0, 0, 0, 0xb85f30), SP(0.28, 0, 0.52, 0, 0x3f9a4a, 1, 1.25, 1), SP(0.16, 0.08, 0.8, 0.05, 0x5cb85c)],
  meeting: () => [B(1.7, 0.05, 0.9, 0, 0.36, 0, 0xb98458), B(0.12, 0.36, 0.5, -0.6, 0, 0, 0x734a32), B(0.12, 0.36, 0.5, 0.6, 0, 0, 0x734a32), B(0.25, 0.02, 0.18, -0.4, 0.41, 0, DARK)],
  counter: () => [B(1, 0.5, 0.6, 0, 0, 0, 0x8a5a3c, WOOD_L)],
  safe: () => [B(0.75, 0.75, 0.65, 0, 0, 0, 0x7e8892, 0x9aa3ad), CY(0.06, 0.06, 0.03, 0.1, 0.4, 0.33, 0xd9b04c)],
  glasscounter: () => [B(1, 0.5, 0.6, 0, 0, 0, 0x2f5d4a, 0xe9e1cf), B(1, 0.35, 0.03, 0, 0.5, -0.2, 0xcfe8ff)],
  atm: () => [B(0.5, 0.85, 0.42, 0, 0, 0, 0x3a4256), B(0.3, 0.2, 0.02, 0, 0.5, 0.22, 0x7fd0ff)],
  judgebench: () => [B(1.2, 0.22, 0.8, 0, 0, 0, 0x8a5a3c, 0xb98458), B(1.1, 0.5, 0.5, 0, 0.22, 0, 0x6e4528, 0x9a6a44), CY(0.04, 0.04, 0.12, 0.2, 0.72, 0, 0x3a2a1a, 6)],
  bar: () => [B(0.05, 0.45, 0.05, -0.4, 0, 0, 0x8a5a3c), B(0.05, 0.45, 0.05, 0.4, 0, 0, 0x8a5a3c), B(0.95, 0.05, 0.1, 0, 0.45, 0, WOOD_L)],
  bin: () => [CY(0.15, 0.13, 0.32, 0, 0, 0, 0x5f6b7a)],
  urne: () => [B(0.7, 0.36, 0.5, 0, 0, 0, 0x8a5a3c, 0xb98458), B(0.36, 0.34, 0.3, 0, 0.36, 0, 0xc4e3f7)],
  flagstand: () => [CY(0.1, 0.1, 0.04, 0, 0, 0, METAL), CY(0.015, 0.015, 1.2, 0, 0, 0, 0xb8963c, 6), B(0.12, 0.3, 0.02, 0.08, 0.85, 0, 0x2b4ea2), B(0.12, 0.3, 0.02, 0.2, 0.85, 0, 0xffffff), B(0.12, 0.3, 0.02, 0.32, 0.85, 0, 0xd8504d)],
  bust: () => [B(0.32, 0.55, 0.32, 0, 0, 0, 0xe4dccb), SP(0.11, 0, 0.7, 0, 0xe9e4da), B(0.24, 0.14, 0.18, 0, 0.55, 0, 0xe9e4da)],
  coffee: () => [B(0.32, 0.34, 0.28, 0, 0.5, 0, 0x3a3a44)],
  register: () => [B(0.3, 0.14, 0.25, 0, 0.5, 0, 0x4a4a55), B(0.22, 0.12, 0.03, 0, 0.62, -0.08, 0x8fe39a)],
  cakes: () => [B(0.8, 0.5, 0.5, 0, 0, 0, 0xf2e6c9), B(0.78, 0.25, 0.48, 0, 0.5, 0, 0xdff1ff), ...[-0.25, 0, 0.25].map(x => CY(0.08, 0.08, 0.08, x, 0.52, 0, [0xe86a8c, 0x8a5a3c, 0xf2c94c][Math.round(x * 4 + 1)]))],
  tablec: () => [CY(0.3, 0.3, 0.04, 0, 0.36, 0, WHITE, 16), CY(0.03, 0.03, 0.36, 0, 0, 0, 0x555b66, 6)],
  sofa: it => [B(0.95, 0.22, 0.5, 0, 0, 0, it.c || 0x7b5cf0), B(0.95, 0.32, 0.12, 0, 0.2, 0.2, shade(it.c || 0x7b5cf0, 0.85)), B(0.12, 0.3, 0.5, -0.45, 0.1, 0, shade(it.c || 0x7b5cf0, 0.9)), B(0.12, 0.3, 0.5, 0.45, 0.1, 0, shade(it.c || 0x7b5cf0, 0.9))],
  tvstand: () => [B(0.9, 0.25, 0.32, 0, 0, 0, WOOD), B(0.75, 0.42, 0.04, 0, 0.25, 0, DARK)],
  bed: it => [B(0.7, 0.22, 1.05, 0, 0, 0, WOOD), B(0.66, 0.08, 1.0, 0, 0.22, 0, WHITE), B(0.66, 0.06, 0.6, 0, 0.3, 0.2, it.c || 0x5b8def), B(0.5, 0.08, 0.2, 0, 0.3, -0.35, 0xffffff), B(0.72, 0.4, 0.05, 0, 0, -0.52, 0x734a32)],
  nightstand: () => [B(0.32, 0.3, 0.3, 0, 0, 0, WOOD), CY(0.06, 0.08, 0.14, 0, 0.3, 0, 0xffe7a0, 8)],
  wardrobe: () => [B(0.8, 1.2, 0.4, 0, 0, 0, 0x8a5a3c), B(0.02, 1.1, 0.01, 0, 0.05, 0.2, 0x5b3a22)],
  rug: it => [B(it.w || 1.6, 0.01, it.d || 1.1, 0, 0, 0, it.c || 0xe86a8c)],
  bookshelf: () => [B(0.85, 1.15, 0.32, 0, 0, 0, 0x734a32), ...[0.2, 0.5, 0.8].flatMap((y, r) => [-0.28, -0.08, 0.12, 0.3].map((x, i) => B(0.14, 0.22, 0.22, x, y, 0.02, [0xd8504d, 0x5b8def, 0xf2c94c, 0x4bbf8b, 0x9b6ee8][(r + i) % 5])))],
  fridge: () => [B(0.55, 1.1, 0.5, 0, 0, 0, 0xeef2f6), B(0.03, 0.3, 0.02, 0.18, 0.6, 0.26, METAL)],
  kitchen: () => [B(1, 0.5, 0.55, 0, 0, 0, 0xe8e2d6, 0x9aa3ad), B(0.32, 0.02, 0.3, -0.22, 0.5, 0, DARK), CY(0.08, 0.08, 0.02, 0.2, 0.5, 0, DARK), B(1, 0.5, 0.3, 0, 1.0, -0.12, 0xe8e2d6)],
  tableh: () => [B(0.95, 0.05, 0.65, 0, 0.36, 0, WOOD_L), ...[[-0.42, -0.27], [0.42, -0.27], [-0.42, 0.27], [0.42, 0.27]].map(([x, z]) => B(0.05, 0.36, 0.05, x, 0, z, WOOD))],
  shelf: () => [B(0.95, 0.9, 0.4, 0, 0, 0, 0xd0d4dc), ...[0.15, 0.45, 0.75].flatMap((y, r) => [-0.3, -0.1, 0.1, 0.3].map((x, i) => B(0.15, 0.13, 0.2, x, y, 0.08, [0xe8504d, 0xf2c94c, 0x5b8def, 0x4bbf8b, 0xf08a3c][(r * 2 + i) % 5])))],
  fridgeglass: () => [B(0.9, 1.05, 0.45, 0, 0, 0, 0x9aa3ad), B(0.82, 0.9, 0.02, 0, 0.08, 0.23, 0xcfefff)],
  display: () => [B(0.9, 0.45, 0.5, 0, 0, 0, 0xf2e6c9), B(0.88, 0.25, 0.48, 0, 0.45, 0, 0xdff1ff), ...[-0.25, 0.05, 0.3].map(x => SP(0.07, x, 0.55, 0, 0xd99a3c, 1.6, 0.6, 0.8))],
  breadshelf: () => [B(0.9, 0.95, 0.38, 0, 0, 0, 0x8a5a3c), ...[0.25, 0.55].flatMap(y => [-0.25, 0, 0.25].map(x => SP(0.06, x, y + 0.08, 0.05, 0xd99a3c, 2.2, 0.8, 0.8)))],
  oven: () => [B(0.8, 0.9, 0.6, 0, 0, 0, 0x3a3a44), B(0.6, 0.3, 0.02, 0, 0.35, 0.31, 0xff9a3c)],
  sacks: () => [SP(0.18, -0.15, 0.18, 0, 0xe8dcc0, 1, 1.1, 0.8), SP(0.18, 0.18, 0.18, 0.05, 0xe2d4b4, 1, 1.1, 0.8), SP(0.16, 0, 0.45, 0, 0xe8dcc0, 1, 1, 0.8)],
  worktable: () => [B(0.95, 0.05, 0.6, 0, 0.42, 0, 0xc9b48a), B(0.9, 0.42, 0.55, 0, 0, 0, 0x8a5a3c), SP(0.08, 0.1, 0.5, 0, 0xf4efe0, 1.6, 0.5, 1)],
  vending: () => [B(0.6, 1.15, 0.45, 0, 0, 0, 0xd8504d), B(0.4, 0.75, 0.02, -0.05, 0.3, 0.23, 0xcfefff)],
  cooler: () => [B(0.3, 0.55, 0.3, 0, 0, 0, 0xeef2f6), CY(0.12, 0.12, 0.3, 0, 0.55, 0, 0x8fd0ff)],
  reception: () => [B(1, 0.55, 0.56, 0, 0, 0, 0x7b5cf0, 0xffffff)],
  ticket: () => [B(0.4, 0.95, 0.35, 0, 0, 0, 0x2f7d5b), B(0.26, 0.2, 0.02, 0, 0.6, 0.18, 0xf2c94c)],
  gate: () => [B(0.08, 0.5, 0.7, -0.3, 0, 0, METAL), B(0.08, 0.5, 0.7, 0.3, 0, 0, METAL), B(0.5, 0.04, 0.04, 0, 0.35, 0, 0xd8504d)],
  stairs: () => [0, 1, 2, 3].map(k => B(0.9, 0.08 * (k + 1), 0.22, 0, 0, -0.33 + k * 0.22, 0x9aa0aa)),
  stairs_up: () => [0, 1, 2, 3, 4].map(k => B(0.8, 0.1 * (k + 1), 0.18, 0, 0, 0.36 - k * 0.18, 0xb9b3a6)),
  rack: it => [B(0.9, 0.04, 0.04, 0, 0.85, 0, METAL), B(0.04, 0.85, 0.04, -0.43, 0, 0, METAL), B(0.04, 0.85, 0.04, 0.43, 0, 0, METAL), ...[-0.3, -0.1, 0.1, 0.3].map((x, i) => B(0.12, 0.45, 0.2, x, 0.38, 0, it.c ? shade(it.c, 1 - i * 0.1) : [0xd94f9c, 0x5b8def, 0xf2c94c, 0x4bbf8b][i]))],
  foldtable: () => [B(0.9, 0.05, 0.5, 0, 0.38, 0, WOOD_L), B(0.85, 0.38, 0.45, 0, 0, 0, 0x8a5a3c), ...[-0.25, 0.05, 0.3].map((x, i) => B(0.2, 0.08, 0.2, x, 0.43, 0, [0x5b8def, 0xe86a8c, 0xf2c94c][i]))],
  fitting: () => [B(0.8, 1.2, 0.05, 0, 0, -0.35, 0xd94f9c), B(0.05, 1.2, 0.7, -0.38, 0, 0, 0xd94f9c), B(0.03, 0.03, 0.75, 0.38, 1.2, 0, METAL)],
  bike: it => [CY(0.16, 0.16, 0.03, -0.25, 0.16, 0, DARK, 14), CY(0.16, 0.16, 0.03, 0.25, 0.16, 0, DARK, 14), B(0.5, 0.04, 0.04, 0, 0.32, 0, it.c || 0x2f7d5b), B(0.04, 0.3, 0.04, -0.12, 0.2, 0, it.c || 0x2f7d5b)].map(g => g.rotateX(0)),
  carshow: it => [B(0.95, 0.22, 0.48, 0, 0.06, 0, it.c || 0xd8504d), B(0.5, 0.18, 0.44, -0.05, 0.28, 0, it.c || 0xd8504d), B(0.46, 0.14, 0.45, -0.05, 0.3, 0, 0x2a3a50), ...[[0.32, 0.24], [-0.32, 0.24], [0.32, -0.24], [-0.32, -0.24]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12).rotateX(Math.PI / 2).translate(x, 0.1, z), DARK))],
  tires: () => [0, 1, 2].map(k => paint(new THREE.TorusGeometry(0.15, 0.07, 8, 14).rotateX(Math.PI / 2).translate(0, 0.07 + k * 0.14, 0), 0x1f1f24)),
  workbench: () => [B(1, 0.05, 0.55, 0, 0.45, 0, WOOD_L), B(0.95, 0.45, 0.5, 0, 0, 0, 0x5f6b7c), B(0.2, 0.1, 0.12, 0.25, 0.5, 0, 0xd8504d)],
  printer: () => [B(0.55, 0.4, 0.42, 0, 0, 0, 0xd8dce4), B(0.4, 0.04, 0.3, 0, 0.4, 0, DARK)],
  bossdesk: () => [B(1.1, 0.05, 0.6, 0, 0.38, 0, 0x6e4528), B(1.05, 0.38, 0.56, 0, 0, 0, 0x5b391f), B(0.3, 0.2, 0.03, 0.1, 0.43, -0.15, DARK), CY(0.06, 0.08, 0.14, -0.38, 0.43, 0, 0xffe7a0, 8)],
  armchair: it => [B(0.5, 0.22, 0.5, 0, 0, 0, it.c || 0x5b391f), B(0.5, 0.36, 0.1, 0, 0.2, 0.2, it.c || 0x5b391f), B(0.08, 0.2, 0.5, -0.23, 0.2, 0, shade(it.c || 0x5b391f, 0.85)), B(0.08, 0.2, 0.5, 0.23, 0.2, 0, shade(it.c || 0x5b391f, 0.85))],
  bench: () => [B(0.9, 0.05, 0.3, 0, 0.24, 0, WOOD_L), B(0.9, 0.24, 0.04, 0, 0.29, 0.13, WOOD), B(0.05, 0.24, 0.26, -0.4, 0, 0, DARK), B(0.05, 0.24, 0.26, 0.4, 0, 0, DARK)],
};
const fallback = () => [B(0.5, 0.4, 0.5, 0, 0, 0, 0xb9a88a)];

// Objets muraux (sur le mur du fond gauche « L » : x = -0.5, ou droit « R » : z = -0.5) : un panneau coloré
const WALL = {
  whiteboard: { w: 1.2, h: 0.65, y: 0.75, c: 0xffffff, f: 0xb8bec9 }, tv: { w: 0.9, h: 0.5, y: 0.8, c: 0x1d2230, f: 0x333a4a },
  menu: { w: 0.7, h: 0.6, y: 0.85, c: 0x2b2f3a, f: 0x8a5a3c }, frame: { w: 0.6, h: 0.5, y: 0.95, c: null, f: 0x8a5a3c },
  cupshelf: { w: 0.8, h: 0.15, y: 1.0, c: 0xffffff, f: 0x8a5a3c }, metrosign: { w: 0.9, h: 0.3, y: 1.1, c: 0x2f7d5b, f: 0xf2c94c },
  mirror: { w: 0.5, h: 0.8, y: 0.6, c: 0xdff1ff, f: 0xd9b04c }, toolwall: { w: 1.0, h: 0.6, y: 0.75, c: 0x5f6b7c, f: 0x3a3d46 },
  elevator: { w: 0.8, h: 1.25, y: 0.02, c: 0xc0c6d0, f: 0x8a8f99 }, mailboxes: { w: 0.9, h: 0.5, y: 0.6, c: 0xd9b04c, f: 0x8a5a3c },
  clock: { w: 0.28, h: 0.28, y: 1.25, c: 0xffffff, f: 0x333333 },
};

export function createInterior3D(renderer, opts) {
  const scene = new THREE.Scene();
  scene.background = C(0xc9bdf0);
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x7a6a90, 1.15);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(-4, 9, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.1, metalness: 0.2, emissive: 0x9fd0ff, emissiveIntensity: 0.35 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.45, depthWrite: false });

  let room = null, sig = '', glow = null;
  const people = new Map();
  const labelsEl = document.createElement('div'); labelsEl.id = 'labels3d';
  const gameEl = document.getElementById('game'); // sous l'interface (fenêtres, barres), comme les épingles
  if (gameEl) document.body.insertBefore(labelsEl, gameEl.nextSibling); else document.body.appendChild(labelsEl);
  let labels = [];

  function clear() {
    if (room) { scene.remove(room); room.traverse(o => { if (o.geometry) o.geometry.dispose(); }); room = null; }
    labelsEl.innerHTML = ''; labels = [];
  }

  // ---------- Construction d'un étage ----------
  function build(L, b, title) {
    clear();
    room = new THREE.Group();
    const { w, h } = L;
    const zoneAt = (x, y) => L.zones.findIndex(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    const geos = [];
    // Socle (terre et pelouse, comme une maquette) et sol de chaque pièce en damier doux
    geos.push(B(w + 0.5, 0.5, h + 0.5, (w - 1) / 2, -0.55, (h - 1) / 2, 0x7a5236, 0x8bc06a));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const zi = zoneAt(x, y);
      const cols = zi >= 0 ? L.zones[zi].floor : L.floor;
      geos.push(B(1, 0.05, 1, x, -0.05, y, cols[(x + y) % 2]));
    }
    // Murs du fond (gauche et droit), avec plinthe et chaperon
    const wall = L.wall;
    geos.push(B(0.12, WALL_H, h + 0.12, -0.56, -0.05, (h - 1) / 2 - 0.06, wall, shade(wall, 1.06)));
    geos.push(B(w + 0.12, WALL_H, 0.12, (w - 1) / 2 - 0.06, -0.05, -0.56, shade(wall, 0.92), shade(wall, 1.06)));
    geos.push(B(0.03, 0.1, h, -0.49, 0, (h - 1) / 2, shade(wall, 0.7)));
    geos.push(B(w, 0.1, 0.03, (w - 1) / 2, 0, -0.49, shade(wall, 0.65)));
    // Fenêtres (cadre blanc, vitre lumineuse)
    const win = (alongX, at) => {
      if (alongX) { geos.push(B(0.86, 0.9, 0.04, at, 0.45, -0.49, 0xffffff)); }
      else { geos.push(B(0.04, 0.9, 0.86, -0.49, 0.45, at, 0xffffff)); }
      const g = alongX ? new THREE.BoxGeometry(0.72, 0.76, 0.02).translate(at, 0.9, -0.465) : new THREE.BoxGeometry(0.02, 0.76, 0.72).translate(-0.465, 0.9, at);
      const m = new THREE.Mesh(g, glassMat); room.add(m);
    };
    (L.winL || []).forEach(y => win(false, y));
    (L.winR || []).forEach(x => win(true, x));
    // Objets muraux
    for (const it of L.items) {
      if (!it.wall) continue;
      const d = WALL[it.k] || { w: 0.6, h: 0.5, y: 0.9, c: 0xdddddd, f: 0x8a5a3c };
      const alongX = it.wall === 'R';
      const fc = d.f, cc = d.c == null ? (it.c || 0x8fd3a8) : d.c;
      if (alongX) { geos.push(B(d.w, d.h, 0.04, it.at, d.y, -0.48, fc)); geos.push(B(d.w - 0.08, d.h - 0.08, 0.02, it.at, d.y + 0.04, -0.455, cc)); }
      else { geos.push(B(0.04, d.h, d.w, -0.48, d.y, it.at, fc)); geos.push(B(0.02, d.h - 0.08, d.w - 0.08, -0.455, d.y + 0.04, it.at, cc)); }
    }
    // Cloisons basses entre les pièces (portes laissées libres) et murets de façade (sauf l'entrée)
    const isDoor = (z, x, y) => (z.doors || []).some(([dx, dy]) => dx === x && dy === y);
    const edges = new Set();
    for (const z of L.zones) {
      if (z.walls === false) continue;
      for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
        if (isDoor(z, x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (nx >= z.x && nx < z.x + z.w && ny >= z.y && ny < z.y + z.h) continue;
          const nz = zoneAt(nx, ny);
          if (nz >= 0 && isDoor(L.zones[nz], nx, ny)) continue;
          const ex = x + dx / 2, ey = y + dy / 2, key = `${ex},${ey}`;
          if (edges.has(key)) continue;
          edges.add(key);
          geos.push(dx !== 0 ? B(0.1, LOW_H + 0.25, 1.04, ex, 0, ey, z.wall, shade(z.wall, 1.2)) : B(1.04, LOW_H + 0.25, 0.1, ex, 0, ey, z.wall, shade(z.wall, 1.2)));
        }
      }
    }
    const isEntrance = (x, y) => L.entrance && L.entrance.x === x && L.entrance.y === y;
    const frontCol = (x, y) => { const zi = zoneAt(x, y); return zi >= 0 && L.zones[zi].walls !== false ? L.zones[zi].wall : shade(wall, 0.8); };
    for (let x = 0; x < w; x++) if (!isEntrance(x, h - 1)) geos.push(B(1.04, LOW_H, 0.1, x, 0, h - 0.5, frontCol(x, h - 1), shade(frontCol(x, h - 1), 1.2)));
    for (let y = 0; y < h; y++) if (!isEntrance(w - 1, y)) geos.push(B(0.1, LOW_H, 1.04, w - 0.5, 0, y, frontCol(w - 1, y), shade(frontCol(w - 1, y), 1.2)));
    // Paillasson devant la porte
    if (L.entrance) geos.push(B(0.7, 0.012, 0.5, L.entrance.x, 0, L.entrance.y, 0x3fae73));
    const shell = new THREE.Mesh(merge(geos), mat);
    shell.receiveShadow = true; shell.castShadow = true;
    room.add(shell);

    // Meubles (un maillage par meuble, tous touchables) + halo doré sous ceux qui ont une action
    const glowGeos = [];
    const seen = new Set();
    for (const it of L.items) {
      if (it.wall) continue;
      const parts = (FURN[it.k] || fallback)(it);
      const m = new THREE.Mesh(merge(parts), mat);
      m.position.set(it.x, 0, it.y);
      m.castShadow = !it.flat; m.receiveShadow = true;
      m.userData.tile = [it.x, it.y];
      room.add(m);
      const key = `${it.x},${it.y}`;
      if (!it.on && (it.action || (it.actions && it.actions.length)) && !seen.has(key)) {
        seen.add(key);
        glowGeos.push(new THREE.RingGeometry(0.4, 0.48, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2).translate(it.x, 0.01, it.y));
      }
    }
    if (glowGeos.length) { glow = new THREE.Mesh(merge(glowGeos), glowMat); glow.userData.noTap = true; room.add(glow); } else glow = null;
    scene.add(room);
    sun.target.position.set((w - 1) / 2, 0, (h - 1) / 2);

    // Étiquettes des pièces et nom du lieu (HTML, nettes)
    const mk = (cls, html, pos, onclick) => {
      const el = document.createElement('div');
      el.className = `lab3d ${cls}`; el.innerHTML = html;
      if (onclick) { el.style.pointerEvents = 'auto'; el.onclick = e => { e.stopPropagation(); onclick(); }; }
      labelsEl.appendChild(el);
      labels.push({ el, pos });
    };
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    mk('title', `${opts.icon(b)} ${esc(title)}`, new THREE.Vector3(-0.5, WALL_H + 0.25, -0.5));
    for (const z of L.zones) {
      const col = '#' + C(z.wall).getHexString();
      mk('zone', `<i>${z.icon || ''}</i>${esc(opts.t(z.label))}`, new THREE.Vector3(z.x - 0.2, 0.55, z.y + z.h - 0.6));
      labels[labels.length - 1].el.style.background = col;
    }
    if (L.entrance) mk('exit', `🚪 ${esc(opts.t('Sortir'))}`, new THREE.Vector3(L.entrance.x, 0.15, L.entrance.y + 0.75), () => opts.leave());
    return { cx: (w - 1) / 2, cz: (h - 1) / 2, size: Math.max(w, h) };
  }

  // ---------- Habitants ----------
  const FIG_H = 0.58; // hauteur d'un personnage dans les pièces (personnages détaillés : figure3d.js)
  function syncPeople(views, floorIdx, L, playerId, time) {
    const keep = new Set();
    for (const [id, v] of views) {
      if (!v.pos || v.floor !== floorIdx) continue;
      const a = opts.actorById(id);
      if (!a) continue;
      keep.add(id);
      let p = people.get(id);
      const lk = `${a.texKey}`;
      if (!p || p.lk !== lk) {
        if (p) scene.remove(p.g);
        const g = new THREE.Group();
        const mesh = new THREE.Mesh(figurePose(a.look || {}), FIGURE_MAT);
        mesh.castShadow = true; mesh.userData.actorId = id;
        g.add(mesh);
        if (id === playerId) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
          ring.position.y = 0.012; g.add(ring);
          const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xffa800, emissiveIntensity: 0.9 }));
          arrow.userData.bob = true; g.add(arrow);
        }
        scene.add(g);
        p = { g, mesh, lk };
        people.set(id, p);
      }
      // Posture : debout, assis (sur une chaise, un banc, un canapé), allongé (lit), selon le poste
      const st = v.pos;
      const sit = !v.lie && (st.seat || ['sit', 'back_sit', 'read', 'eat', 'eat1', 'eat2', 'type', 'type1', 'type2', 'drink', 'drink1', 'drink2'].includes(st.pose) || v.act === 'watch_tv' || v.act === 'read_book' || v.act === 'eat_home' || v.act === 'eat_cafe');
      p.mesh.rotation.set(0, 0, 0); p.mesh.position.set(0, 0, 0);
      const geo = figurePose(a.look || {}, sit ? 'sit' : 'stand');
      if (p.mesh.geometry !== geo) p.mesh.geometry = geo;
      if (v.lie) { p.mesh.rotation.z = Math.PI / 2; p.mesh.position.set(0.3, 0.3, 0); }
      else if (sit) p.mesh.position.y = 0.13;
      p.g.position.set(st.x, 0, st.y);
      // Orientation : vers la table du poste, sinon vers la caméra (on voit les visages)
      let ry = Math.PI / 4;
      if (st.table) ry = Math.atan2(st.table[0] - st.x, st.table[1] - st.y);
      else if (st.face < 0) ry = -Math.PI / 4;
      p.g.rotation.y = ry;
      if (v.lie) p.g.rotation.y = 0;
      for (const ch of p.g.children) if (ch.userData.bob) ch.position.y = 0.78 + Math.sin(time / 180) * 0.04;
      // petite respiration / mouvement des mains au travail
      p.mesh.scale.set(FIG_H, FIG_H * (v.lie ? 1 : 1 + Math.sin(time / 600 + id.length) * 0.012), FIG_H);
    }
    for (const [id, p] of people) if (!keep.has(id)) { scene.remove(p.g); people.delete(id); } // (géométries partagées)
  }

  // ---------- Toucher ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tap(cx, cy, camera) {
    if (!room) return;
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const figs = [...people.values()].map(p => p.mesh);
    const hp = ray.intersectObjects(figs, false)[0];
    if (hp && hp.object.userData.actorId) return opts.onTap(null, null, hp.object.userData.actorId);
    const hits = ray.intersectObjects(room.children.filter(o => !o.userData.noTap), false);
    for (const h of hits) {
      if (h.object.userData.tile) return opts.onTap(h.object.userData.tile[0], h.object.userData.tile[1], null);
      const p = h.point;
      return opts.onTap(Math.round(p.x), Math.round(p.z), null);
    }
  }

  const v3 = new THREE.Vector3();
  function placeLabels(camera) {
    for (const l of labels) {
      v3.copy(l.pos).project(camera);
      const x = (v3.x + 1) / 2 * innerWidth, y = (1 - v3.y) / 2 * innerHeight;
      l.el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  return {
    scene, labelsEl,
    // appelé à chaque image quand le joueur est à l'intérieur
    update(ctx, camera, time) {
      const { building: b, L, floorIdx, views, title, playerId } = ctx;
      const s = `${b.id}:${floorIdx}`;
      let info = null;
      if (s !== sig) { sig = s; info = build(L, b, title); }
      syncPeople(views, floorIdx, L, playerId, time);
      if (glow) glow.material.opacity = 0.25 + Math.sin(time / 500) * 0.2;
      placeLabels(camera);
      return info; // non nul quand une nouvelle pièce vient d'être construite (pour cadrer la caméra)
    },
    reset() { sig = ''; clear(); for (const [, p] of people) scene.remove(p.g); people.clear(); },
    tap,
    setVisible(on) { labelsEl.style.display = on ? '' : 'none'; },
  };
}
