// Démo 3D « low-poly » du Marais : même plan, mêmes habitants (la simulation tourne pour de vrai),
// rendu Three.js moderne (lumière du soleil, ombres douces, cycle jour / nuit, fenêtres allumées le soir).
// Optimisé pour le téléphone : géométries fusionnées par matériau, arbres et lampadaires instanciés (≈ 20 appels de dessin pour la ville).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUARTIER } from './map/quartier.js';
import { parseMap } from './map/parse.js';
import { World } from './sim/world.js';
import { spawnPeople } from './sim/people.js';
import { CityLife } from './sim/city.js';
import { Government } from './sim/gov.js';
import { Safety } from './sim/safety.js';
import { Justice } from './sim/justice.js';
import { Bank } from './sim/bank.js';
import { Festivals } from './sim/festivals.js';
import { phase, carMayGo, walkMayGo } from './sim/traffic.js';
import { findPath } from './sim/pathfinding.js';
import { cityPulse } from './city/render.js';

import { TYPES } from './map/types.js';
import { freeUnits, isClosed } from './sim/city.js';
import { sellerAt, openings } from './sim/jobs.js';

// Lance le rendu 3D de la ville. opts.demo : page de démo (HUD propre, la simulation avance ici) ;
// sinon mode jeu : opts.player, onPlace(b), onPerson(a), onGround(x, y), onFiller(), saver.
export function startCity3D(world, opts = {}) {
const map = world.map;

// ---------- Moteur ----------
const mobile = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (opts.demo) document.body.appendChild(renderer.domElement);
else { const cv = renderer.domElement; cv.id = 'city3d'; document.body.insertBefore(cv, document.getElementById('game')); }
if (opts.saver) { renderer.shadowMap.enabled = false; renderer.setPixelRatio(1); }

const scene = new THREE.Scene();
// Éclairage d'environnement : reflets doux sur les vitres, le zinc et l'eau (rendu « moderne »)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.16;
const SKY_DAY = new THREE.Color(0xbcd6ee), SKY_NIGHT = new THREE.Color(0x10162c), SKY_DUSK = new THREE.Color(0xf0a878);
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(scene.background, 45, 120);

const W = map.w, H = map.h;
const CX = W / 2, CZ = H / 2 + 2;
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 300);
camera.position.set(CX + 20, 22, CZ + 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(CX, 0, CZ);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.minDistance = 6; controls.maxDistance = 75;
controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.25;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.addEventListener('change', () => { // on reste au-dessus du quartier
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, 0, W);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, 2, H);
});

// Lumière : ciel + soleil (ombres douces)
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x8a7a66, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
sun.target.position.set(CX, 0, CZ);

// ---------- Outils ----------
const C = c => new THREE.Color(c);
// Colore toutes les faces d'une géométrie (couleurs de sommets) ; top = couleur du dessus si donnée
function paint(geo, color, top = null) {
  const n = geo.attributes.position.count, cols = new Float32Array(n * 3);
  const a = C(color), b = top != null ? C(top) : a;
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const c = nrm && nrm.getY(i) > 0.9 ? b : a;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
// Toit à la Mansart : tronc de pyramide (zinc / ardoise)
function mansard(w, d, h, inset, x, y, z) {
  const a = w / 2, b = d / 2, i = inset;
  const v = [
    -a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b,                     // base
    -a + i, h, -b + i, a - i, h, -b + i, a - i, h, b - i, -a + i, h, b - i, // sommet
  ];
  const idx = [4, 6, 5, 4, 7, 6, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng.translate(x, y, z);
}
// UV des murs en mètres : la texture de façade se répète par travée (BAY) et par étage (FLOOR)
const BAY = 0.5, FLOOR = 0.5;
function wallUV(geo, w, h, d, offY = 0) {
  const uv = geo.attributes.uv, nrm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    if (ny > 0.9) { uv.setXY(i, 0, 0); continue; }
    const fw = nx > 0.9 ? d : w;
    uv.setXY(i, uv.getX(i) * fw / BAY / 4, (uv.getY(i) * h + offY) / FLOOR / 4);
  }
  return geo;
}
// UV des vitrines : une vitrine par case, toute la hauteur du rez-de-chaussée
function shopUV(geo, w, d) {
  const uv = geo.attributes.uv, nrm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nrm.getY(i)) > 0.9) { uv.setXY(i, 0, 0); continue; }
    uv.setX(i, uv.getX(i) * (Math.abs(nrm.getX(i)) > 0.9 ? d : w) / 2);
  }
  return geo;
}
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// ---------- Textures dessinées par le code (aucune image) ----------
function canvasTex(size, draw, repeat = true) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// Façade haussmannienne : 4 travées × 4 étages par motif (pierre claire, portes-fenêtres, garde-corps)
const LIT = []; for (let i = 0; i < 16; i++) LIT.push(rnd() < 0.55);
const facadeMap = canvasTex(512, (g, S) => {
  const c = S / 4;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
    const x = bx * c, y = fy * c;
    g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, y + c - 4, c, 3);             // joint d'étage
    g.fillStyle = '#e9e4da'; g.fillRect(x + c * 0.26, y + c * 0.16, c * 0.48, c * 0.7); // encadrement
    g.fillStyle = '#3f4d63'; g.fillRect(x + c * 0.3, y + c * 0.2, c * 0.4, c * 0.62);  // vitre
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + c * 0.3, y + c * 0.2, c * 0.4, c * 0.12);
    g.fillStyle = '#e9e4da'; g.fillRect(x + c * 0.49, y + c * 0.2, c * 0.02, c * 0.62); // meneau
    g.fillStyle = '#2d2f36';                                                            // garde-corps
    g.fillRect(x + c * 0.24, y + c * 0.68, c * 0.52, c * 0.03);
    for (let k = 0; k < 6; k++) g.fillRect(x + c * (0.26 + k * 0.09), y + c * 0.7, c * 0.015, c * 0.12);
  }
});
const facadeGlow = canvasTex(512, (g, S) => {
  const c = S / 4;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
    if (!LIT[fy * 4 + bx]) continue;
    g.fillStyle = ['#ffcf7a', '#ffd99a', '#ffe7b8'][(fy + bx) % 3];
    g.fillRect(bx * c + c * 0.3, fy * c + c * 0.2, c * 0.4, c * 0.62);
  }
});
facadeGlow.colorSpace = THREE.SRGBColorSpace;
// Rez-de-chaussée commerçant : grande vitrine + porte, devanture teintée par la couleur du commerce
const shopMap = canvasTex(256, (g, S) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 2; k++) {
    const x = k * S / 2;
    g.fillStyle = '#26303f'; g.fillRect(x + S * 0.05, S * 0.22, S * 0.4, S * 0.7);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + S * 0.05, S * 0.22, S * 0.4, S * 0.1);
    g.fillStyle = 'rgba(255,214,140,0.35)'; g.fillRect(x + S * 0.08, S * 0.55, S * 0.34, S * 0.3);
  }
});
const shopGlow = canvasTex(256, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffd890';
  for (let k = 0; k < 2; k++) g.fillRect(k * S / 2 + S * 0.05, S * 0.22, S * 0.4, S * 0.7);
});
// Bureaux vitrés
const glassMap = canvasTex(256, (g, S) => {
  const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#9cc4ea'); grd.addColorStop(1, '#5a86b8');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(30,40,60,0.55)';
  for (let k = 0; k <= 4; k++) { g.fillRect(k * S / 4 - 2, 0, 4, S); g.fillRect(0, k * S / 4 - 3, S, 6); }
});
const glassGlow = canvasTex(256, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) if (rnd() < 0.6) { g.fillStyle = '#ffe2b0'; g.fillRect((i % 4) * S / 4 + 4, Math.floor(i / 4) * S / 4 + 5, S / 4 - 8, S / 4 - 10); }
});

const mats = {
  ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  marks: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }),
  wall: new THREE.MeshStandardMaterial({ vertexColors: true, map: facadeMap, emissiveMap: facadeGlow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }),
  shop: new THREE.MeshStandardMaterial({ vertexColors: true, map: shopMap, emissiveMap: shopGlow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ map: glassMap, emissiveMap: glassGlow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.12, metalness: 0.35, color: 0xdfefff }),
  roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, flatShading: true }),
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
  water: new THREE.MeshStandardMaterial({ color: 0x4f8fc4, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.92 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0 }),
};
const add = (geos, mat, { cast = true, receive = true } = {}) => {
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
  m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m); return m;
};

// ---------- Sol : trottoirs surélevés (bordures), rues, pavés, herbe, eau ----------
const T = (x, y) => (map.tiles[y] && map.tiles[y][x]) || null;
const groundGeos = [], markGeos = [];
const GROUND = {
  pave: [0xd9cdb5, 0xa9a297, 0.08], cobble: [0xc4b393, 0x9c8f78, 0.08], grass: [0x6db35b, 0x5d8243, 0.1], road: [0x4e5361, 0x4e5361, 0.0],
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.ground === 'water') continue;
  const gdef = GROUND[t.ground] || GROUND.pave;
  const h = gdef[2] + (t.ground === 'road' && t.avenue ? 0.001 : 0);
  // les cases au bord de la Seine descendent jusqu'à l'eau (quai)
  const quay = T(x, y - 1) && T(x, y - 1).ground === 'water';
  const g = box(1, h + 0.02 + (quay ? 0.25 : 0), 1, x, -0.02 - (quay ? 0.25 : 0), y);
  paint(g, quay ? 0xcfc6b4 : gdef[1], t.ground === 'road' && (x + y) % 2 ? 0x595e6c : gdef[0]);
  groundGeos.push(g);
}
add(groundGeos, mats.ground, { cast: false });
// Socle façon maquette sous le quartier (terre et pierre), au lieu d'un bord qui flotte
const plinth = new THREE.Mesh(paint(box(W + 0.6, 1.4, H + 0.6, CX - 0.5, -1.45, H / 2 - 0.5), 0x8c7a62, 0xcfc6b4), mats.ground);
plinth.receiveShadow = true; scene.add(plinth);
const water = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.6).rotateX(-Math.PI / 2).translate(CX - 0.5, -0.12, 0.8), mats.water);
water.receiveShadow = true; scene.add(water);

// Marquages : passages piétons, pointillés, double ligne de la rue principale
const roadAt = (x, y) => T(x, y) && T(x, y).ground === 'road';
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.ground !== 'road') continue;
  const alongX = roadAt(x + 1, y) || roadAt(x - 1, y);
  const links = [roadAt(x + 1, y), roadAt(x - 1, y), roadAt(x, y + 1), roadAt(x, y - 1)].filter(Boolean).length;
  const straight = links <= 2 && !((roadAt(x + 1, y) || roadAt(x - 1, y)) && (roadAt(x, y + 1) || roadAt(x, y - 1)));
  if (!straight) continue;
  const yy = 0.005;
  if (t.crossing) {
    for (let k = 0; k < 5; k++) {
      const o = -0.36 + k * 0.18;
      markGeos.push(alongX ? box(0.62, 0.004, 0.09, x, yy, y + o) : box(0.09, 0.004, 0.62, x + o, yy, y));
    }
  } else if (t.avenue) {
    for (const o of [-0.035, 0.035]) markGeos.push(alongX ? box(1, 0.004, 0.025, x, yy, y + o) : box(0.025, 0.004, 1, x + o, yy, y));
  } else if ((x + y) % 2 === 0) {
    markGeos.push(alongX ? box(0.42, 0.004, 0.04, x, yy, y) : box(0.04, 0.004, 0.42, x, yy, y));
  }
}
add(markGeos, mats.marks, { cast: false });

// ---------- Immeubles ----------
const TYPE_FLOORS = { home: 6, office: 9, cafe: 5, bakery: 5, shop: 5, fashion: 5, garage: 2, metro: 0, cityhall: 4, police: 4, hospital: 7, firestation: 3, prison: 3, school: 4, court: 4, bank: 5 };
const SHOP_COLOR = { cafe: 0xc9453f, bakery: 0xd9922b, shop: 0x2f9e5f, fashion: 0xd94f9c, bank: 0x1f6a4a, garage: 0x2f7d8b };
const STONE = [0xf1e2c4, 0xe9cfae, 0xf4ead8, 0xe2c6b4, 0xeed8bf, 0xd3dadf, 0xe8cdc8, 0xe4d9ac, 0xcddcd7, 0xf0dcc0];
const PUBLIC = { cityhall: 0xf4ecda, police: 0xe3e8f0, hospital: 0xf7f8fa, firestation: 0xc65a46, prison: 0xb9b6ae, school: 0xf3e3c3, court: 0xe8eaee };
const ROOFS = [0x6f7d8f, 0x5f6b7c, 0x7a8798, 0x566173];
const wallGeos = [], shopGeos = [], glassGeos = [], roofGeos = [], solidGeos = [];

// Rectangles d'un bâtiment (ses cases regroupées en blocs : pas de « briques »)
function rects(tiles) {
  const set = new Set(tiles.map(t => `${t.x},${t.y}`)), used = new Set(), out = [];
  const sorted = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const t of sorted) {
    if (used.has(`${t.x},${t.y}`)) continue;
    let w = 1; while (set.has(`${t.x + w},${t.y}`) && !used.has(`${t.x + w},${t.y}`)) w++;
    let h = 1;
    outer: for (;;) { for (let k = 0; k < w; k++) if (!set.has(`${t.x + k},${t.y + h}`) || used.has(`${t.x + k},${t.y + h}`)) break outer; h++; }
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used.add(`${t.x + k},${t.y + j}`);
    out.push({ x0: t.x, y0: t.y, w, h });
  }
  return out;
}

// ---------- Bâtiments reconnaissables au premier coup d'œil (enseignes, colonnes, croix, camion…) ----------
const signCache = {};
function signMat(text, bg, fg = '#ffffff') {
  const k = text + bg + fg;
  if (signCache[k]) return signCache[k];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 70; g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > 460 && size > 30) { size -= 4; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (signCache[k] = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}
// Façade principale : le côté qui donne sur la rue (de préférence vers la caméra)
function frontOf(r) {
  const walk = (x, y) => T(x, y) && T(x, y).walk;
  const sides = [
    { n: [0, 1], bonus: 0.6, tiles: Array.from({ length: r.w }, (_, k) => [r.x0 + k, r.y0 + r.h]) },
    { n: [1, 0], bonus: 0.6, tiles: Array.from({ length: r.h }, (_, k) => [r.x0 + r.w, r.y0 + k]) },
    { n: [0, -1], bonus: 0, tiles: Array.from({ length: r.w }, (_, k) => [r.x0 + k, r.y0 - 1]) },
    { n: [-1, 0], bonus: 0, tiles: Array.from({ length: r.h }, (_, k) => [r.x0 - 1, r.y0 + k]) },
  ];
  let best = sides[0], bs = -1;
  for (const sd of sides) { const s = sd.tiles.filter(([x, y]) => walk(x, y)).length + sd.bonus; if (s > bs) { bs = s; best = sd; } }
  return best.n;
}
const SIGNS = {
  cafe: ['CAFÉ', '#8e2b28'], bakery: ['BOULANGERIE', '#7a4a12', '#f6d48a'], shop: ['SUPÉRETTE', '#1f6a3f'], fashion: ['MODE', '#8a2a5e'],
  garage: ['GARAGE', '#1d4f58'], police: ['POLICE', '#1d3f8f'], hospital: ['HÔPITAL', '#c62f42'], firestation: ['POMPIERS', '#a32a1c'],
  school: ['ÉCOLE', '#2b4ea2'], bank: ['BANQUE', '#1b5a3c', '#f2d27a'], court: ['TRIBUNAL', '#3a4152', '#f2d27a'], cityhall: ['MAIRIE', '#2b4ea2'],
  prison: ['MAISON D’ARRÊT', '#4a4b50'], office: ['BUREAUX', '#2d3e5c'], metro: ['MÉTRO', '#2f7352', '#f6d860'],
};
const extraMeshes = [];
const ROOF_BY_TYPE = { hospital: 0xeceff3, police: 0x2d4f9a, firestation: 0xb8392b, court: 0x3a4152, bank: 0x2f6a4c, school: 0xb5654a, cityhall: 0x2b4ea2, prison: 0x55565b };
const ROOF_SIGN = new Set(['cityhall', 'court', 'bank', 'police', 'firestation', 'school', 'prison']); // (hôpital : la grande croix rouge suffit)
function landmark(type, r, cx, cz, w, d, base, top) {
  if (!SIGNS[type]) return;
  const n = frontOf(r);
  const half = n[0] ? w / 2 : d / 2, span = n[0] ? d : w;
  const rotY = Math.atan2(n[0], n[1]);
  const px = (o, along = 0) => cx + n[0] * (half + o) + (n[0] ? 0 : along);
  const pz = (o, along = 0) => cz + n[1] * (half + o) + (n[1] ? 0 : along);
  // boîte alignée sur la façade : longueur le long de la façade, profondeur vers la rue
  const fbox = (len, h, dep, o, along, y, c, top2 = null) => solidGeos.push(paint(n[0] ? box(dep, h, len, px(o, along), y, pz(o, along)) : box(len, h, dep, px(o, along), y, pz(o, along)), c, top2));
  const add2 = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m); extraMeshes.push(m); return m; };
  const S = SIGNS[type];
  // Enseigne lumineuse au-dessus du rez-de-chaussée
  const sy = type === 'metro' ? base + 1.05 : type === 'office' ? base + 0.35 : base + FLOOR + 0.13;
  const sw = Math.min(span * 0.8, type === 'metro' ? 0.7 : 1.7);
  const sg = add2(new THREE.PlaneGeometry(sw, 0.24), signMat(S[0], S[1], S[2] || '#ffffff'));
  sg.castShadow = false; sg.position.set(px(type === 'metro' ? -half + 0.02 : 0.035), sy, pz(type === 'metro' ? -half + 0.02 : 0.035)); sg.rotation.y = rotY;

  // Enseigne sur le toit, tournée vers la caméra : on reconnaît le lieu d'un coup d'œil, même de loin
  if (ROOF_SIGN.has(type)) {
    const ry = top + 0.62;
    const rs = add2(new THREE.PlaneGeometry(1.25, 0.3), signMat(S[0], S[1], S[2] || '#ffffff'));
    rs.castShadow = false; rs.position.set(cx, ry + 0.2, cz); rs.rotation.y = Math.PI / 4;
    for (const k of [-0.45, 0.45]) solidGeos.push(paint(box(0.03, 0.22, 0.03, cx + k * 0.707, ry - 0.05, cz - k * 0.707), 0x3a3d46));
  }
  if (type === 'cityhall' || type === 'court' || type === 'bank') {
    // Colonnes, entablement et fronton : l'allure d'un monument
    const nC = type === 'bank' ? 4 : Math.max(4, Math.round(span * 2.4));
    const h = type === 'bank' ? FLOOR * 1.8 : FLOOR * 2.3;
    const stone = type === 'bank' ? 0xeee6d6 : 0xf3eee2;
    if (type === 'court') for (let k = 0; k < 4; k++) fbox(span * 0.95, 0.04, 0.55 - k * 0.12, 0.27 - k * 0.06, 0, base - 0.02 + k * 0.04, 0xe6e1d6);
    for (let k = 0; k < nC; k++) {
      const al = (k / (nC - 1) - 0.5) * span * 0.82;
      solidGeos.push(paint(new THREE.CylinderGeometry(0.055, 0.065, h, 10).translate(px(0.22, al), base + h / 2, pz(0.22, al)), stone));
    }
    fbox(span * 0.92, 0.09, 0.5, 0.2, 0, base + h, stone);
    const shape = new THREE.Shape([new THREE.Vector2(-span * 0.46, 0), new THREE.Vector2(span * 0.46, 0), new THREE.Vector2(0, 0.38)]);
    const ped = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06).rotateY(rotY).translate(px(0.4), base + h + 0.09, pz(0.4));
    add2(paint(ped, stone), mats.solid);
    if (type === 'court') { // balance dorée sur le fronton
      const gold = new THREE.MeshStandardMaterial({ color: 0xd9b04c, metalness: 0.7, roughness: 0.3 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02).translate(0, 0.09, 0), gold));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.015).translate(0, 0.17, 0), gold));
      for (const dx of [-0.1, 0.1]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12).translate(dx, 0.1, 0), gold));
      g.position.set(px(0.49), base + h + 0.12, pz(0.49)); g.rotation.y = rotY; scene.add(g);
    }
  }
  if (type === 'hospital') { // grande croix rouge sur le toit + auvent des urgences
    const y = top + 0.56;
    solidGeos.push(paint(box(0.9, 0.03, 0.9, cx, y, cz), 0xffffff));
    solidGeos.push(paint(box(0.62, 0.04, 0.18, cx, y + 0.03, cz), 0xd8283c));
    solidGeos.push(paint(box(0.18, 0.04, 0.62, cx, y + 0.03, cz), 0xd8283c));
    fbox(0.8, 0.05, 0.45, 0.22, 0, base + FLOOR * 0.75, 0xd8283c);
    for (const al of [-0.36, 0.36]) solidGeos.push(paint(new THREE.CylinderGeometry(0.02, 0.02, FLOOR * 0.75, 6).translate(px(0.4, al), base + FLOOR * 0.375, pz(0.4, al)), 0xdddddd));
  }
  if (type === 'police') { // bandeau bleu et gyrophare sur le toit
    fbox(span * 0.98, 0.07, 0.03, 0.02, 0, base + FLOOR * 0.98, 0x1d3f8f);
    const giro = add2(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x3d7bff, emissive: 0x2a5bff, emissiveIntensity: 2.5 }));
    giro.position.set(cx + w * 0.3, top + 0.6, cz - d * 0.3); giro.userData.blink = true;
  }
  if (type === 'firestation') { // grandes portes rouges et camion de pompiers devant
    for (const al of [-span * 0.22, span * 0.22]) {
      fbox(span * 0.36, FLOOR * 0.85, 0.03, 0.015, al, base, 0xc0392b);
      for (let k = 1; k < 4; k++) fbox(span * 0.36, 0.012, 0.035, 0.016, al, base + k * FLOOR * 0.21, 0x8e2a1f);
    }
    const truck = [paint(box(0.85, 0.2, 0.32, 0, 0.06, 0), 0xd62f24), paint(box(0.28, 0.16, 0.3, 0.3, 0.26, 0), 0xd62f24),
      paint(box(0.24, 0.08, 0.31, 0.31, 0.3, 0), 0x2a3a50), paint(box(0.55, 0.03, 0.12, -0.12, 0.3, 0), 0xc8c8c8)];
    for (const [dx, dz] of [[0.28, 0.16], [-0.28, 0.16], [0.28, -0.16], [-0.28, -0.16]]) truck.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2).translate(dx, 0.06, dz), 0x1c1c22));
    const tg = mergeGeometries(truck).rotateY(rotY + Math.PI / 2).translate(px(0.75), 0.005, pz(0.75));
    add2(tg, mats.solid);
  }
  if (type === 'school') { // horloge sur la façade
    const clock = add2(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20).rotateX(Math.PI / 2).rotateY(rotY), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    clock.position.set(px(0.03), base + FLOOR * 2.4, pz(0.03));
    const hand = add2(new THREE.BoxGeometry(0.015, 0.11, 0.01).translate(0, 0.04, 0).rotateY(rotY), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    hand.position.set(px(0.05), base + FLOOR * 2.4, pz(0.05));
  }
  if (type === 'metro') { // entourage vert et globes orangés, à la parisienne
    const g = 0x2f7352;
    for (const al of [-0.3, 0.3]) {
      solidGeos.push(paint(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 8).translate(cx + (n[0] ? 0 : al), base + 0.47, cz + (n[1] ? 0 : al)), g));
      const glob = add2(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a2a, emissiveIntensity: 1.6 }));
      glob.position.set(cx + (n[0] ? 0 : al), base + 1.0, cz + (n[1] ? 0 : al));
    }
  }
  if (type === 'cafe') { // terrasse : tables et parasols sur le trottoir
    for (const al of [-span * 0.25, span * 0.25]) {
      const x = px(0.6, al), z = pz(0.6, al);
      solidGeos.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12).translate(x, 0.26, z), 0xf4f1e8));
      solidGeos.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6).translate(x, 0.38, z), 0x34323d));
      solidGeos.push(paint(new THREE.ConeGeometry(0.28, 0.14, 8).translate(x, 0.72, z), 0xd8504d));
    }
  }
  if (type === 'garage') for (let k = 0; k < 3; k++) solidGeos.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12).translate(px(0.4, span * 0.3), 0.12 + k * 0.07, pz(0.4, span * 0.3)), 0x1f1f24));
  if (type === 'prison') { // mur d'enceinte et mirador
    fbox(span, 0.5, 0.06, 0.25, 0, base, 0xa7a59e);
    solidGeos.push(paint(box(0.3, 1.5, 0.3, px(0.1, span * 0.4), base, pz(0.1, span * 0.4)), 0x8f8d86));
    solidGeos.push(paint(box(0.42, 0.05, 0.42, px(0.1, span * 0.4), base + 1.5, pz(0.1, span * 0.4)), 0x5f6066));
  }
}
const tops = {}; // hauteur du toit de chaque lieu (pour les épingles)
function building(r, type, seed, bid = null) {
  const x = r.x0 + r.w / 2 - 0.5, z = r.y0 + r.h / 2 - 0.5;
  const w = r.w - 0.04, d = r.h - 0.04;
  const floors = TYPE_FLOORS[type] ?? 6;
  const base = 0.08;
  if (type === 'metro') { // bouche de métro : entourage vert et panneau
    solidGeos.push(paint(box(w * 0.8, 0.12, d * 0.8, x, base, z), 0x2f7352));
    solidGeos.push(paint(box(0.06, 0.9, 0.06, x - w * 0.35, base, z), 0x2f7352));
    solidGeos.push(paint(box(0.3, 0.22, 0.06, x - w * 0.35, base + 0.9, z), 0xf2c94c));
    landmark(type, r, x, z, w, d, base, base + 1);
    if (bid != null) tops[bid] = 1.3;
    return;
  }
  if (type === 'office') { // tour de bureaux vitrée
    const h = floors * FLOOR;
    glassGeos.push(wallUV(box(w, h, d, x, base, z), w, h, d));
    solidGeos.push(paint(box(w + 0.04, 0.08, d + 0.04, x, base + h, z), 0x3d4556));
    landmark(type, r, x, z, w, d, base, base + h);
    if (bid != null) tops[bid] = base + h + 0.1;
    return;
  }
  const stone = PUBLIC[type] ?? STONE[seed % STONE.length];
  const shopType = SHOP_COLOR[type];
  let y = base;
  if (shopType || type === 'filler-shop') { // rez-de-chaussée commerçant + store
    const col = shopType || [0x2b4ea2, 0x7a3b5c, 0x2f6b4a, 0x8a5a2b][seed % 4];
    shopGeos.push(paint(shopUV(box(w, FLOOR, d, x, y, z), w, d), col));
    // stores en toile au-dessus des vitrines, sur les 4 côtés
    for (const [dx, dz, sw, sd] of [[0, d / 2 + 0.09, w * 0.92, 0.2], [0, -d / 2 - 0.09, w * 0.92, 0.2], [w / 2 + 0.09, 0, 0.2, d * 0.92], [-w / 2 - 0.09, 0, 0.2, d * 0.92]]) {
      solidGeos.push(paint(box(sw, 0.05, sd, x + dx, y + FLOOR * 0.82, z + dz), col));
    }
    y += FLOOR;
  }
  const upper = Math.max(1, floors - (y > base ? 1 : 0));
  const h = upper * FLOOR;
  wallGeos.push(paint(wallUV(box(w, h, d, x, y, z), w, h, d, y - base), stone));
  y += h;
  // corniche + toit à la Mansart en zinc, cheminées
  solidGeos.push(paint(box(w + 0.08, 0.06, d + 0.08, x, y, z), 0xd8cfbd));
  y += 0.06;
  const roofH = type === 'firestation' || type === 'prison' ? 0.12 : 0.5;
  const rcol = ROOF_BY_TYPE[type] ?? ROOFS[seed % ROOFS.length]; // les lieux importants ont un toit de couleur reconnaissable
  roofGeos.push(paint(mansard(w + 0.02, d + 0.02, roofH, Math.min(0.32, Math.min(w, d) * 0.3), x, y, z), rcol));
  if (bid != null) tops[bid] = Math.max(tops[bid] || 0, y + roofH);
  if (bid != null) landmark(type, r, x, z, w, d, base, y);
  if (roofH > 0.2) {
    const n = 1 + (seed % 2);
    for (let k = 0; k < n; k++) {
      const cx = x - w / 2 + 0.3 + ((seed * 7 + k * 3) % 10) / 10 * (w - 0.6);
      solidGeos.push(paint(box(0.12, 0.28, 0.2, cx, y + roofH - 0.05, z + (k ? 0.15 : -0.15)), 0xb5654a, 0x8a4a36));
    }
  }
  // drapeau sur les bâtiments publics
  if (PUBLIC[type] && type !== 'prison') {
    solidGeos.push(paint(box(0.025, 0.7, 0.025, x, y + roofH, z), 0xcccccc));
    [0x2b4ea2, 0xffffff, 0xd8504d].forEach((c, i) => solidGeos.push(paint(box(0.12, 0.2, 0.02, x + 0.07 + i * 0.12, y + roofH + 0.48, z), c)));
  }
}

let seed = 1;
for (const b of map.buildings) for (const r of rects(b.tiles)) building(r, b.type, seed++ * 7 + b.id, b.id);
// Immeubles de décor (X) : parcelles de 2×2 aux hauteurs variées, un tiers avec boutique en bas
const fillerTiles = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T(x, y).deco === 'filler') fillerTiles.push({ x, y });
const taken = new Set();
for (const t of fillerTiles) {
  if (taken.has(`${t.x},${t.y}`)) continue;
  const ok = (x, y) => T(x, y) && T(x, y).deco === 'filler' && !taken.has(`${x},${y}`);
  const w = ok(t.x + 1, t.y) ? 2 : 1, h = ok(t.x, t.y + 1) && (w === 1 || ok(t.x + 1, t.y + 1)) ? 2 : 1;
  for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) taken.add(`${t.x + k},${t.y + j}`);
  const s = seed++ * 13;
  const nearStreet = [[0, -1], [0, h], [-1, 0], [w, 0]].some(([dx, dy]) => T(t.x + dx, t.y + dy) && T(t.x + dx, t.y + dy).walk);
  TYPE_FLOORS.filler = 5 + (s % 3);
  TYPE_FLOORS['filler-shop'] = TYPE_FLOORS.filler;
  building({ x0: t.x, y0: t.y, w, h }, nearStreet && s % 3 === 0 ? 'filler-shop' : 'filler', s);
}
add(wallGeos, mats.wall);
add(shopGeos, mats.shop);
add(glassGeos, mats.glass);
add(roofGeos, mats.roof);

// ---------- Arbres, lampadaires, bancs, fontaines, statue ----------
const trees = [];
const binSpots = []; // poubelles de rue (pour les sacs qui débordent)
const lamps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.deco === 'tree') trees.push([x, y, 1]);
  if (t.deco === 'avtree') { const sd = roadAt(x, y + 1) ? 0.3 : roadAt(x, y - 1) ? -0.3 : 0; trees.push([x, y + sd, 0.85]); }
  if (t.deco === 'fountain') {
    solidGeos.push(paint(new THREE.CylinderGeometry(0.46, 0.5, 0.18, 20).translate(x, 0.19, y), 0xcfc6b4));
    solidGeos.push(paint(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 10).translate(x, 0.4, y), 0xcfc6b4));
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20).translate(x, 0.29, y), mats.water); scene.add(pool);
  }
  if (t.deco === 'statue') {
    solidGeos.push(paint(box(0.4, 0.5, 0.4, x, 0.08, y), 0xe7e0d2));
    solidGeos.push(paint(new THREE.CylinderGeometry(0.07, 0.12, 0.45, 8).translate(x, 0.8, y), 0x9aa58f));
    solidGeos.push(paint(new THREE.SphereGeometry(0.07, 8, 6).translate(x, 1.08, y), 0x9aa58f));
  }
  // lampadaires le long des rues (un sur quatre)
  if (t.walk && (t.ground === 'pave' || t.ground === 'cobble') && !t.deco) {
    const side = roadAt(x, y + 1) ? [0, 0.38] : roadAt(x, y - 1) ? [0, -0.38] : roadAt(x + 1, y) ? [0.38, 0] : roadAt(x - 1, y) ? [-0.38, 0] : null;
    const along = side ? (side[1] ? x : y) : 0;
    if (side && along % 4 === 2) lamps.push([x + side[0], y + side[1]]);
    // poubelles de rue (mêmes places que la vue 2D : on peut les toucher)
    else if (side && t.ground === 'pave' && along % 8 === 5) {
      const bx = x + side[0] * 0.8, bz = y + side[1] * 0.8;
      binSpots.push([bx, bz]);
      solidGeos.push(paint(box(0.03, 0.42, 0.03, bx, 0.08, bz), 0x2e6b4a));
      solidGeos.push(paint(new THREE.CylinderGeometry(0.08, 0.07, 0.2, 10).translate(bx, 0.32, bz), 0xd5dde2));
      solidGeos.push(paint(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 12).translate(bx, 0.43, bz), 0x3f9a5c));
    }
  }
}
// bancs dans les parcs et sur les places (mêmes cases que la vue 2D)
const benchList = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.walk && t.ground === 'grass' && !t.deco && (x + y * 3) % 7 === 0) benchList.push(`${x},${y}`);
  else if (t.walk && t.ground === 'cobble' && (x * 5 + y) % 13 === 0) benchList.push(`${x},${y}`);
}
const benchSet = new Set(benchList.slice(0, 14));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (benchSet.has(`${x},${y}`)) {
    solidGeos.push(paint(box(0.45, 0.04, 0.16, x, 0.2, y), 0xa9774c));
    solidGeos.push(paint(box(0.45, 0.14, 0.03, x, 0.24, y - 0.07), 0xa9774c));
    for (const dx of [-0.18, 0.18]) solidGeos.push(paint(box(0.03, 0.1, 0.12, x + dx, 0.1, y), 0x34323d));
  }
}
// Arbres : tronc + feuillage facetté (instanciés : 2 appels de dessin pour tous les arbres)
const trunkGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 6).translate(0, 0.2, 0);
const leafGeo = new THREE.IcosahedronGeometry(0.32, 1).translate(0, 0.62, 0);
const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 }), trees.length);
const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), trees.length);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3();
const LEAF = [0x4caf50, 0x5cb85c, 0x3f9a4a, 0x6cc070, 0xe98fb5];
const treeRnd = trees.map(() => rnd());
trees.forEach(([x, y, s], i) => {
  const k = s * (0.85 + rnd() * 0.35);
  q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0));
  m4.compose(v3.set(x, 0.08, y), q, new THREE.Vector3(k, k, k));
  trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
  leaves.setColorAt(i, C(LEAF[Math.floor(rnd() * LEAF.length)]));
});
for (const im of [trunks, leaves]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
// Lampadaires (instanciés) : mât + lanterne qui s'allume la nuit
const poleGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.85, 6).translate(0, 0.5, 0);
const headGeo = new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.95, 0);
const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.5, metalness: 0.4 }), lamps.length);
const heads = new THREE.InstancedMesh(headGeo, mats.bulb, lamps.length);
lamps.forEach(([x, y], i) => { m4.makeTranslation(x, 0, y); poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); });
poles.castShadow = true; scene.add(poles, heads);

// Feux tricolores aux carrefours (3 lampes par poteau, couleur mise à jour selon sim/traffic.js)
const lightPoles = [];
const LAMP_OFF = new THREE.MeshStandardMaterial({ color: 0x30333b, roughness: 0.4 });
const LAMP_ON = { r: new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2 }),
  a: new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 2 }),
  g: new THREE.MeshStandardMaterial({ color: 0x34d058, emissive: 0x34d058, emissiveIntensity: 2 }) };
const lampGeo = new THREE.SphereGeometry(0.035, 8, 6);
for (const j of map.junctions) {
  for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    const t = T(j.x + dx, j.y + dy);
    if (!t || t.ground === 'road' || t.building != null || t.ground === 'water') continue;
    const px = j.x + dx * 0.6, pz = j.y + dy * 0.6;
    solidGeos.push(paint(box(0.04, 0.8, 0.04, px, 0.08, pz), 0x2c2f38));
    solidGeos.push(paint(box(0.1, 0.3, 0.1, px, 0.75, pz), 0x23252c));
    const lp = { j, axis: dx === dy ? 'x' : 'y', meshes: {} };
    [['r', 0.98], ['a', 0.9], ['g', 0.82]].forEach(([k, yy]) => {
      const m = new THREE.Mesh(lampGeo, LAMP_OFF); m.position.set(px - dx * 0.05, yy, pz - dy * 0.05); scene.add(m); lp.meshes[k] = m;
    });
    lightPoles.push(lp);
  }
}
add(solidGeos, mats.solid);

// ---------- Habitants (la vraie simulation) ----------
const bodyGeo = new THREE.CapsuleGeometry(0.06, 0.12, 3, 8).translate(0, 0.17, 0);
const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.1, 6).translate(0, 0.05, 0);
const headG = new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.33, 0);
const hairG = new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.345, 0);
const people = new Map();
const matCache = new Map();
const matOf = c => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); return matCache.get(c); };
function personView(a) {
  const g = new THREE.Group();
  const lk = a.look || {};
  const legs = new THREE.Mesh(legGeo, matOf(lk.legs ?? 0x3a4766));
  const body = new THREE.Mesh(bodyGeo, matOf(lk.body ?? 0x5b8def));
  const head = new THREE.Mesh(headG, matOf(lk.skin ?? 0xf1c7a3));
  const parts = [legs, body, head];
  if (lk.hairStyle !== 'chauve') parts.push(new THREE.Mesh(hairG, matOf(lk.hairColor ?? 0x2b1d16)));
  for (const p of parts) { p.castShadow = true; g.add(p); }
  if (a.demoMe || a.isPlayer) { // toi : anneau doré au sol
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    ring.position.y = 0.01; g.add(ring);
  }
  g.userData.actorId = a.id;
  scene.add(g);
  return { g, body, last: { x: a.px, y: a.py }, phase: rnd() * 6 };
}

// ---------- Voitures (suivent les rues, s'arrêtent au feu rouge) ----------
const CAR_COLORS = [0xd8504d, 0x3d6fd8, 0xf2f2f2, 0x2b2f3a, 0xf2c94c, 0x4bbf8b, 0x9aa0aa];
const jset = new Set(map.junctions.map(j => `${j.x},${j.y}`));
const gates = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!roadAt(x, y)) continue;
  const dir = x === 0 ? [1, 0] : x === W - 1 ? [-1, 0] : y === H - 1 ? [0, -1] : null;
  if (dir) { gates.push({ x, y, dir }); if (T(x, y).avenue) gates.push({ x, y, dir }); }
}
function carGeo(col) {
  const parts = [
    paint(box(0.62, 0.14, 0.3, 0, 0.06, 0), col),
    paint(box(0.34, 0.12, 0.26, -0.03, 0.2, 0), col),
    paint(box(0.3, 0.09, 0.27, -0.03, 0.21, 0), 0x2a3a50),
  ];
  for (const [dx, dz] of [[0.2, 0.15], [-0.2, 0.15], [0.2, -0.15], [-0.2, -0.15]]) parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2).translate(dx, 0.06, dz), 0x1c1c22));
  return mergeGeometries(parts);
}
const carGeos = CAR_COLORS.map(carGeo);
const cars = [];
function pickNext(c) {
  const [dx, dy] = c.dir;
  const opts = [[dx, dy], [-dy, dx], [dy, -dx]].filter(([ax, ay]) => roadAt(c.x + ax, c.y + ay));
  if (!opts.length) return null;
  const st = opts.find(([ax, ay]) => ax === dx && ay === dy);
  const d = st && (opts.length === 1 || rnd() < 0.65) ? st : opts[Math.floor(rnd() * opts.length)];
  return { x: c.x + d[0], y: c.y + d[1], dir: d };
}
function spawnCar() {
  const gt = gates[Math.floor(rnd() * gates.length)];
  const mesh = new THREE.Mesh(carGeos[Math.floor(rnd() * carGeos.length)], mats.solid);
  mesh.castShadow = true; scene.add(mesh);
  const c = { mesh, x: gt.x, y: gt.y, dir: gt.dir, t: 0, speed: 1.4 + rnd(), alive: true };
  c.next = pickNext(c);
  cars.push(c);
}
for (let i = 0; i < 10; i++) { spawnCar(); const c = cars[cars.length - 1]; for (let k = Math.floor(rnd() * 14); k > 0 && c.next; k--) { c.x = c.next.x; c.y = c.next.y; c.dir = c.next.dir; c.next = pickNext(c); } }
function updateCars(dt) {
  for (const c of cars) {
    if (!c.next) { c.alive = false; continue; }
    const axis = c.dir[0] !== 0 ? 'x' : 'y';
    const red = jset.has(`${c.next.x},${c.next.y}`) && !jset.has(`${c.x},${c.y}`) && !carMayGo(world, c.next.x, c.next.y, axis);
    const ahead = cars.some(o => o !== c && o.alive && o.dir[0] === c.dir[0] && o.dir[1] === c.dir[1] && (() => {
      const ax = ((o.x + o.dir[0] * o.t) - (c.x + c.dir[0] * c.t)) * c.dir[0] + ((o.y + o.dir[1] * o.t) - (c.y + c.dir[1] * c.t)) * c.dir[1];
      const side = Math.abs((o.x - c.x) * c.dir[1] - (o.y - c.y) * c.dir[0]);
      return ax > 0 && ax < 0.9 && side < 0.3;
    })());
    if (red && c.t <= 0.32) c.t = Math.min(0.3, c.t + c.speed * dt);
    else if (!ahead) c.t += c.speed * dt;
    while (c.t >= 1 && c.next) { c.t -= 1; c.x = c.next.x; c.y = c.next.y; c.dir = c.next.dir; c.next = pickNext(c); }
    const lane = 0.2;
    const px = c.x + c.dir[0] * c.t - c.dir[1] * lane, pz = c.y + c.dir[1] * c.t + c.dir[0] * lane;
    c.mesh.position.set(px, 0.005, pz);
    c.mesh.rotation.y = Math.atan2(-c.dir[1], c.dir[0]);
  }
  for (const c of cars) if (!c.alive) scene.remove(c.mesh);
  for (let i = cars.length - 1; i >= 0; i--) if (!cars[i].alive) cars.splice(i, 1);
  const target = Math.round(16 * (world.hour > 6 && world.hour < 22 ? 1 : 0.35));
  if (cars.length < target && rnd() < dt * 1.5) spawnCar();
}

// ---------- Jour / nuit ----------
const tmpC = new THREE.Color();
function lighting() {
  const h = world.hour;
  const day = THREE.MathUtils.clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1); // 0 la nuit, 1 à midi
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(h - 19.5) / 1.6, 0, 1) + THREE.MathUtils.clamp(1 - Math.abs(h - 6.5) / 1.2, 0, 1);
  const night = THREE.MathUtils.clamp(1 - day * 3, 0, 1);
  const ang = ((h - 6) / 12) * Math.PI;
  // soleil venant de la gauche de l'écran : les ombres tombent vers la droite, bien visibles depuis la caméra
  sun.position.set(CX - 24, 9 + Math.max(0.12, Math.sin(ang)) * 24, CZ + Math.cos(ang) * 18);
  sun.intensity = night > 0.6 ? 0.35 : 0.2 + day * 2.9; // la nuit : clair de lune bleuté
  sun.color.set(0xfff1dc).lerp(C(0xff9a5a), Math.min(1, dusk));
  if (night > 0.6) sun.color.set(0x9fb4ff);
  hemi.intensity = 0.1 + day * 0.7;
  hemi.color.set(night > 0.5 ? 0x6f86c8 : 0xdfeeff);
  scene.environmentIntensity = 0.03 + day * 0.13;
  tmpC.copy(SKY_NIGHT).lerp(SKY_DAY, Math.min(1, day * 1.6)).lerp(SKY_DUSK, Math.min(0.55, dusk * 0.55));
  scene.background.copy(tmpC); scene.fog.color.copy(tmpC);
  const glow = night * 1.6;
  mats.wall.emissiveIntensity = glow; mats.shop.emissiveIntensity = glow * 1.1; mats.glass.emissiveIntensity = glow * 0.45;
  mats.bulb.emissiveIntensity = night * 3;
  renderer.toneMappingExposure = 0.95;
}
let forceNight = false;
function updateLights() {
  for (const lp of lightPoles) {
    const ph = phase(world, lp.j.x, lp.j.y);
    const c = ph.green !== lp.axis ? 'r' : ph.amber ? 'a' : 'g';
    if (lp.state === c) continue;
    lp.state = c;
    for (const k of ['r', 'a', 'g']) lp.meshes[k].material = k === c ? LAMP_ON[k] : LAMP_OFF;
  }
}

// ---------- Mode jeu : toucher, épingles des lieux, caméra qui suit, messages ----------
const PIN_COLORS = {
  home: '#9b6ee8', cafe: '#d8504d', bakery: '#e58a1f', shop: '#2f9e5f', fashion: '#d94f9c', garage: '#2f7d8b', office: '#4a7fd8',
  metro: '#2a9d8f', cityhall: '#2b4ea2', police: '#2b3a6b', hospital: '#e2475b', firestation: '#c0392b', prison: '#5f6066',
  school: '#d9962b', court: '#4a5266', bank: '#1f7a52',
};
let pinsEl = null;
const pins = [];
const camGoal = { t: null };
const api = { renderer, scene, camera, controls };
function centerOn(x, z, instant = false) {
  const goal = new THREE.Vector3(x, 0, z);
  if (instant) { const d = goal.clone().sub(controls.target); controls.target.add(d); camera.position.add(d); return; }
  camGoal.t = goal;
}
api.centerOnPlayer = () => { const p = opts.player; if (p) centerOn(p.px, p.py); };
api.focusBuilding = b => {
  const cx = b.tiles.reduce((s, t) => s + t.x, 0) / b.tiles.length, cz = b.tiles.reduce((s, t) => s + t.y, 0) / b.tiles.length;
  centerOn(cx, cz); pointAt(new THREE.Vector3(cx, (tops[b.id] || 2) + 0.6, cz));
};
api.focusActor = a => { centerOn(a.px, a.py); pointAt(null, a); };
// Flèche qui désigne un lieu / une personne (3 s)
let arrow = null;
function pointAt(pos, actor = null) {
  if (!arrow) { arrow = document.createElement('div'); arrow.className = 'arrow3d'; arrow.textContent = '⬇'; document.body.appendChild(arrow); }
  arrow.dataset.until = performance.now() + 3500;
  arrow._pos = pos; arrow._actor = actor;
}
// Petit message qui s'envole au-dessus de ton personnage
api.floatText = (str, color) => {
  const p = opts.player; if (!p) return;
  const el = document.createElement('div');
  el.className = 'float3d'; el.textContent = str; el.style.color = color;
  const s = project(new THREE.Vector3(p.px, 0.6, p.py));
  api._floatN = ((api._floatN || 0) + 1) % 3;
  el.style.left = `${s.x}px`; el.style.top = `${s.y - api._floatN * 18}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
};
const v = new THREE.Vector3();
function project(p) { v.copy(p).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, front: v.z < 1 }; }

if (!opts.demo) {
  // Épingles des lieux (HTML, nettes à toutes les tailles d'écran)
  pinsEl = document.createElement('div'); pinsEl.id = 'pins3d';
  document.body.insertBefore(pinsEl, document.getElementById('game').nextSibling);
  for (const b of map.buildings) {
    const el = document.createElement('div');
    el.className = 'pin3d';
    el.innerHTML = '<i class="ic"></i><b class="st"></b><s class="job">💼</s>';
    el.onclick = e => { e.stopPropagation(); opts.onPlace && opts.onPlace(b); };
    pinsEl.appendChild(el);
    const cx = b.tiles.reduce((s, t) => s + t.x, 0) / b.tiles.length, cz = b.tiles.reduce((s, t) => s + t.y, 0) / b.tiles.length;
    pins.push({ b, el, pos: new THREE.Vector3(cx, (tops[b.id] || 2) + 0.35, cz), show: true, state: '' });
  }
  // Toucher : un habitant, un lieu (façade ou toit), ou le sol pour y aller
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved < 8) tap(e.clientX, e.clientY);
  });
  function tap(cx, cy) {
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const figs = []; for (const [, pv] of people) if (pv.g.visible) figs.push(pv.g);
    const hp = ray.intersectObjects(figs, true)[0];
    if (hp) {
      let o = hp.object; while (o && o.userData.actorId == null) o = o.parent;
      const a = o && world.actorById(o.userData.actorId);
      if (a && !a.isPlayer) return opts.onPerson && opts.onPerson(a);
    }
    const hits = ray.intersectObjects(scene.children.filter(o => (o.isMesh || o.isInstancedMesh) && !o.userData.noTap), false);
    for (const h of hits) {
      const n = h.face ? h.face.normal : new THREE.Vector3(0, 1, 0);
      const p = h.point.clone().addScaledVector(n, -0.06);
      const tx = Math.round(p.x), ty = Math.round(p.z);
      const t = map.tiles[ty] && map.tiles[ty][tx];
      if (!t) continue;
      if (t.building != null) return opts.onPlace && opts.onPlace(map.buildings[t.building]);
      return opts.onTile && opts.onTile(tx, ty, t, h.point); // sol, objet de rue, immeuble de décor : décidé par le jeu
    }
  }
}

const fires = {};
api.showFire = b => {
  if (fires[b.id]) return;
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 2.2, transparent: true, opacity: 0.9, flatShading: true });
  for (const t of b.tiles) for (let k = 0; k < 2; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), fm);
    c.position.set(t.x + (k - 0.5) * 0.3, (tops[b.id] || 2) + 0.2, t.y + (k - 0.5) * 0.2); c.userData.phase = Math.random() * 6; g.add(c);
  }
  g.userData.noTap = true; scene.add(g); fires[b.id] = g;
};
api.hideFire = b => { const g = fires[b.id]; if (g) { scene.remove(g); delete fires[b.id]; } };
let pinTick = 0;
function updateGame(dt) {
  if (opts.demo) return;
  const now = performance.now() / 1000;
  for (const m of extraMeshes) if (m.userData.blink) m.material.emissiveIntensity = Math.sin(now * 8) > 0 ? 3 : 0.3;
  for (const g of Object.values(fires)) for (const c of g.children) { const k = 0.8 + Math.sin(now * 9 + c.userData.phase) * 0.25; c.scale.set(1, k, 1); }
  // la caméra glisse vers sa cible
  if (camGoal.t) {
    const d = camGoal.t.clone().sub(controls.target);
    if (d.length() < 0.02) camGoal.t = null;
    else { d.multiplyScalar(Math.min(1, dt * 5)); controls.target.add(d); camera.position.add(d); }
  }
  // épingles : état (icône, couleur, ouvert / fermé, poste libre) une fois par seconde, position à chaque image
  pinTick -= dt;
  const p = opts.player;
  if (pinTick <= 0) {
    pinTick = 1;
    for (const pin of pins) {
      const b = pin.b;
      let icon = TYPES[b.type].icon, color = PIN_COLORS[b.type] || '#7a6f96', show = true, open = null, job = false;
      if (b.type === 'home') {
        const mine = p && b.id === p.home;
        show = mine || freeUnits(world, b) > 0;
        icon = mine ? (p.housing === 'own' ? '🔑' : '🏠') : '🔑';
        if (mine) color = '#f2b705';
      } else {
        const closed = isClosed(world, b.id);
        if (closed) { icon = '🔒'; color = '#8a8f99'; }
        if (p && p.job && p.job.building === b.id) color = '#f2b705';
        const staffed = b.jobs && b.type !== 'office' && !['police', 'firestation', 'prison'].includes(b.type);
        open = closed ? false : staffed ? !!sellerAt(world, b) : null;
        job = !closed && openings(world, b) > 0;
      }
      pin.show = show;
      const st = `${icon}|${color}|${open}|${job}`;
      if (st !== pin.state) {
        pin.state = st;
        pin.el.querySelector('.ic').textContent = icon;
        pin.el.style.setProperty('--pc', color);
        const s = pin.el.querySelector('.st');
        s.style.display = open == null ? 'none' : ''; s.style.background = open ? '#34c759' : '#e2475b';
        pin.el.querySelector('.job').style.display = job ? '' : 'none';
      }
    }
  }
  // positions + pas de chevauchement (priorité : chez toi / ton travail, puis services et commerces, puis logements libres)
  const prio = b => (p && (b.id === p.home || (p.job && p.job.building === b.id)) ? 3 : b.type === 'home' ? 1 : 2);
  const placed = [];
  const list = pins.map(pin => ({ pin, s: project(pin.pos) })).sort((a, b) => prio(b.pin.b) - prio(a.pin.b));
  for (const { pin, s } of list) {
    let ok = pin.show && s.front && s.x > -40 && s.x < innerWidth + 40 && s.y > -40 && s.y < innerHeight + 40;
    if (ok) ok = !placed.some(q => Math.abs(q.x - s.x) < 34 && Math.abs(q.y - s.y) < 38);
    pin.el.style.display = ok ? '' : 'none';
    if (ok) { placed.push(s); pin.el.style.transform = `translate(${s.x}px, ${s.y}px)`; }
  }
  if (arrow) {
    const live = performance.now() < +arrow.dataset.until;
    arrow.style.display = live ? '' : 'none';
    if (live) {
      const pos = arrow._actor ? new THREE.Vector3(arrow._actor.px, 0.75, arrow._actor.py) : arrow._pos;
      const s = project(pos);
      arrow.style.transform = `translate(${s.x}px, ${s.y + Math.sin(performance.now() / 150) * 5}px)`;
    }
  }
}

// ---------- Décor vivant : saisons, neige, déchets, passants, pigeons, stands des fêtes ----------
const quality = opts.saver ? 0 : mobile ? 1 : 2; // nombre de passants / pigeons selon l'appareil
// Silhouette d'une personne en un seul maillage (1 appel de dessin par personne)
function figureGeo(look) {
  const parts = [
    paint(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 6).translate(0, 0.05, 0), look.legs),
    paint(new THREE.CapsuleGeometry(0.06, 0.12, 3, 8).translate(0, 0.17, 0), look.body),
    paint(new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.33, 0), look.skin),
  ];
  if (look.hair != null) parts.push(paint(new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.345, 0), look.hair));
  return mergeGeometries(parts.map(g => g.index ? g : g));
}
const pickC = a => a[Math.floor(Math.random() * a.length)];
const LOOKS = {
  body: [0xf2c94c, 0xe86a8c, 0x5b8def, 0x4bbf8b, 0x9b6ee8, 0xf08a3c, 0x3cb5c9, 0xffffff, 0x333a4a, 0xd8504d],
  legs: [0x3a4766, 0x2a2f3d, 0x6b4a2f, 0x8a8f99, 0x2e6b4a],
  skin: [0xf6d7c3, 0xf1c7a3, 0xd9a77e, 0xb57a52, 0x8a5634, 0x5e3a24],
  hair: [0x1c1410, 0x4a3020, 0x7a4a2a, 0xb5651d, 0xd9a441, 0xdddddd, null],
};

// Saisons : couleur du feuillage (arbres nus l'hiver)
const SEASON_LEAF = {
  printemps: [0x5cb85c, 0x6cc070, 0x4caf50, 0xe98fb5, 0xf4a9c8],
  ete: [0x2f8a3a, 0x3f9a4a, 0x358f40, 0x4caf50],
  automne: [0xe08a2e, 0xd9622b, 0xf2b33d, 0xb8452a, 0xc9a227],
  hiver: [0x8a8f99],
};
let shownSeason = null;
function applySeason() {
  const s = world.season || 'printemps';
  if (s === shownSeason) return;
  shownSeason = s;
  leaves.visible = s !== 'hiver';
  const pal = SEASON_LEAF[s] || SEASON_LEAF.printemps;
  for (let i = 0; i < trees.length; i++) leaves.setColorAt(i, C(pal[Math.floor(treeRnd[i] * pal.length)]));
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
}

// Neige au sol : elle tient quand il neige et fond ensuite (plus vite au soleil)
const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0, depthWrite: false });
const snowPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 2).rotateX(-Math.PI / 2).translate(CX - 0.5, 0.115, (H - 2) / 2 + 1.5), snowMat);
snowPlane.receiveShadow = true; snowPlane.userData.noTap = true; scene.add(snowPlane);
let snowCover = world.weather === 'snow' ? 0.5 : 0, lastMin = world.minutes;
function updateSnow() {
  const gm = Math.max(0, Math.min(120, world.minutes - lastMin)); lastMin = world.minutes;
  if (world.weather === 'snow') snowCover = Math.min(1, snowCover + gm / 90);
  else snowCover = Math.max(0, snowCover - gm / (world.weather === 'sun' ? 120 : 360));
  snowMat.opacity = snowCover * 0.78;
  snowPlane.visible = snowCover > 0.01;
  mats.roof.emissive.setRGB(1, 1, 1).multiplyScalar(snowCover * 0.32); // toits blanchis
}

// Déchets : papiers sur les trottoirs et sacs au pied des poubelles quand la propreté baisse (world.city.cleanliness)
const litterSpots = [];
for (const [bx, bz] of binSpots) for (const [dx, dz, th] of [[0.15, 0.12, 45], [-0.14, 0.16, 30], [0.2, -0.1, 55]]) litterSpots.push({ x: bx + dx, z: bz + dz, th, bag: true });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.walk && (t.ground === 'pave' || t.ground === 'cobble') && Math.random() < 0.2) litterSpots.push({ x: x + Math.random() - 0.5, z: y + Math.random() - 0.5, th: 25 + Math.random() * 50, bag: false });
}
const bagSpots = litterSpots.filter(l => l.bag), paperSpots = litterSpots.filter(l => !l.bag);
const bags = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.1, 0).scale(1, 0.85, 1), new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.4, flatShading: true }), Math.max(1, bagSpots.length));
const papers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.01, 0.075), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, paperSpots.length));
paperSpots.forEach((l, i) => papers.setColorAt(i, C(pickC([0xf4f1e8, 0x7fb8e0, 0xe8504d, 0xf2c94c]))));
for (const im of [bags, papers]) { im.userData.noTap = true; im.frustumCulled = false; scene.add(im); } // (positions changées après coup)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
let litterLevel = null;
function updateLitter() {
  const c = world.city ? world.city.cleanliness : 100;
  if (litterLevel != null && Math.abs(litterLevel - c) < 0.5) return;
  litterLevel = c;
  const put = (im, list, y) => list.forEach((l, i) => {
    if (c < l.th) { q.setFromEuler(new THREE.Euler(0, (i * 1.7) % 6.28, 0)); m4.compose(v3.set(l.x, y, l.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); } else im.setMatrixAt(i, ZERO);
  });
  put(bags, bagSpots, 0.13); put(papers, paperSpots, 0.09);
  bags.instanceMatrix.needsUpdate = true; papers.instanceMatrix.needsUpdate = true;
}

// Passants de décor : ils traversent le quartier (plus nombreux aux heures de pointe, moins sous la pluie)
const footGates = map.footpaths.filter(p => p.x === 0 || p.y === H - 1 || p.x === W - 1);
const metroB = map.buildings.find(b => b.type === 'metro');
if (metroB) footGates.push(...metroB.entrances, ...metroB.entrances);
const mainWalk = map.footpaths.filter(p => [-1, 1].some(dd => T(p.x, p.y + dd) && T(p.x, p.y + dd).avenue));
const walkers = [];
const MAX_WALKERS = [3, 8, 14][quality];
function spawnWalker() {
  if (!footGates.length) return;
  const g = pickC(footGates), to = pickC(footGates);
  const via = Math.random() < 0.6 ? (Math.random() < 0.5 && mainWalk.length ? pickC(mainWalk) : map.randomFootpath()) : null;
  const leg1 = findPath(map, g, (x, y) => (via ? x === via.x && y === via.y : x === to.x && y === to.y));
  if (!leg1) return;
  let path = leg1.path;
  if (via) { const leg2 = findPath(map, via, (x, y) => x === to.x && y === to.y); if (!leg2) return; path = path.concat(leg2.path); }
  if (path.length < 6) return;
  const look = { body: pickC(LOOKS.body), legs: pickC(LOOKS.legs), skin: pickC(LOOKS.skin), hair: pickC(LOOKS.hair) };
  const mesh = new THREE.Mesh(figureGeo(look), mats.solid);
  mesh.castShadow = quality > 0; mesh.userData.noTap = true;
  mesh.position.set(g.x, 0.08, g.y); scene.add(mesh);
  walkers.push({ mesh, x: g.x, y: g.y, path, speed: 1.1 + Math.random() * 0.5, ph: Math.random() * 6 });
}
function updateWalkers(dt, gameRate) {
  const pulse = cityPulse(world.hour) * (world.weather === 'rain' || world.weather === 'snow' ? 0.4 : 1);
  if (walkers.length < Math.round(MAX_WALKERS * pulse) && Math.random() < dt * 0.8) spawnWalker();
  for (const p of walkers) {
    let budget = p.speed * dt * Math.min(gameRate, 3);
    let moving = false;
    while (budget > 0 && p.path.length) {
      const t = p.path[0];
      const nt = T(t.x, t.y), ct = T(Math.round(p.x), Math.round(p.y));
      if (nt.crossing && ct.ground !== 'road' && !walkMayGo(world, nt.crossing)) break; // feu rouge : on attend
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      moving = true;
      p.mesh.rotation.y = Math.atan2(dx, dy);
      if (d <= budget) { p.x = t.x; p.y = t.y; p.path.shift(); budget -= d; } else { p.x += dx / d * budget; p.y += dy / d * budget; budget = 0; }
    }
    p.ph += dt * (moving ? 14 : 2);
    p.mesh.position.set(p.x, 0.08 + (moving ? Math.abs(Math.sin(p.ph)) * 0.02 : 0), p.y);
  }
  for (let i = walkers.length - 1; i >= 0; i--) if (!walkers[i].path.length) { scene.remove(walkers[i].mesh); walkers[i].mesh.geometry.dispose(); walkers.splice(i, 1); }
}

// Pigeons : ils picorent sur les places et s'envolent quand quelqu'un approche
const pigeonGeo = mergeGeometries([
  paint(new THREE.SphereGeometry(0.05, 8, 6).scale(1.3, 0.8, 0.9).translate(0, 0.05, 0), 0x8a8f99),
  paint(new THREE.SphereGeometry(0.028, 8, 6).translate(0.06, 0.09, 0), 0x6f7480),
  paint(new THREE.ConeGeometry(0.01, 0.03, 4).rotateZ(-Math.PI / 2).translate(0.095, 0.088, 0), 0xe0a050),
]);
const plaza = map.footpaths.filter(p => T(p.x, p.y).ground === 'cobble' || (T(p.x, p.y).ground === 'pave' && !roadAt(p.x, p.y + 1) && !roadAt(p.x, p.y - 1) && !roadAt(p.x + 1, p.y) && !roadAt(p.x - 1, p.y)));
const pigeons = [];
for (let i = 0; i < [3, 8, 12][quality] && plaza.length; i++) {
  const s = pickC(plaza);
  const mesh = new THREE.Mesh(pigeonGeo, mats.solid); mesh.userData.noTap = true; scene.add(mesh);
  pigeons.push({ mesh, x: s.x + Math.random() - 0.5, z: s.y + Math.random() - 0.5, y: 0.08, fly: 0, ph: Math.random() * 6, rot: Math.random() * 6.28 });
}
function updatePigeons(dt) {
  const near = (x, z) => world.actors.some(a => a.outdoors && Math.abs(a.px - x) + Math.abs(a.py - z) < 0.9) || walkers.some(w2 => Math.abs(w2.x - x) + Math.abs(w2.y - z) < 0.8);
  for (const p of pigeons) {
    p.ph += dt;
    if (p.fly > 0) { // en vol vers une autre place
      p.fly -= dt;
      const k = 1 - Math.max(0, p.fly) / p.flyT;
      p.x = p.fx + (p.tx - p.fx) * k; p.z = p.fz + (p.tz - p.fz) * k;
      p.y = 0.08 + Math.sin(k * Math.PI) * 2.2;
      p.mesh.rotation.y = Math.atan2(p.tx - p.fx, p.tz - p.fz) - Math.PI / 2;
      if (p.fly <= 0) p.y = 0.08;
    } else {
      if (Math.random() < dt * 0.3) p.rot += (Math.random() - 0.5) * 2;
      p.mesh.rotation.y = p.rot;
      if (near(p.x, p.z)) { const s = pickC(plaza); Object.assign(p, { fx: p.x, fz: p.z, tx: s.x + Math.random() - 0.5, tz: s.y + Math.random() - 0.5, flyT: 2.5, fly: 2.5 }); }
    }
    const peck = p.fly > 0 ? 0 : Math.max(0, Math.sin(p.ph * 6)) * 0.015;
    p.mesh.position.set(p.x, p.y - peck, p.z);
  }
}

// Stands des fêtes (marché, brocante, concert, musiciens) : mêmes emplacements que la vue 2D (state.scene.fest)
const stands = new Map();
function standMesh(spot) {
  const g = new THREE.Group();
  const add3 = (geo, color) => { const m = new THREE.Mesh(paint(geo, color), mats.solid); m.castShadow = true; g.add(m); return m; };
  if (/marché/.test(spot.name)) {
    add3(new THREE.BoxGeometry(0.7, 0.05, 0.4).translate(0, 0.32, 0), 0xb98458);
    for (const [dx, dz] of [[-0.32, -0.18], [0.32, -0.18], [-0.32, 0.18], [0.32, 0.18]]) add3(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5).translate(dx, 0.35, dz), 0xdddddd);
    const roofCols = [0xd8504d, 0xffffff];
    for (let k = 0; k < 4; k++) add3(new THREE.BoxGeometry(0.19, 0.03, 0.5).rotateX(0.18).translate(-0.28 + k * 0.19, 0.72, 0), roofCols[k % 2]);
    for (let k = 0; k < 5; k++) add3(new THREE.SphereGeometry(0.04, 6, 5).translate(-0.24 + k * 0.12, 0.38, 0.05), pickC([0xe8504d, 0xf2c94c, 0x4bbf8b, 0xf08a3c]));
  } else if (/brocante/.test(spot.name)) {
    add3(new THREE.BoxGeometry(0.6, 0.04, 0.35).translate(0, 0.28, 0), 0x8a5a3c);
    add3(new THREE.BoxGeometry(0.12, 0.12, 0.1).translate(-0.15, 0.36, 0), 0x9b6ee8);
    add3(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8).translate(0.05, 0.37, 0.02), 0x3cb5c9);
    add3(new THREE.BoxGeometry(0.14, 0.03, 0.1).translate(0.18, 0.32, -0.04), 0xf2c94c);
  } else if (/Concert/.test(spot.name)) {
    add3(new THREE.BoxGeometry(1.6, 0.2, 1.0).translate(0, 0.1, 0), 0x3a3d46);
    add3(new THREE.BoxGeometry(1.6, 0.9, 0.06).translate(0, 0.65, -0.47), 0x2b2f45);
    for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mats.bulb); b.position.set(-0.7 + k * 0.233, 1.1 - Math.abs(k - 3) * 0.04, -0.4); g.add(b); }
    add3(new THREE.BoxGeometry(0.12, 0.3, 0.12).translate(-0.6, 0.35, 0.3), 0x1c1c22);
    add3(new THREE.BoxGeometry(0.12, 0.3, 0.12).translate(0.6, 0.35, 0.3), 0x1c1c22);
  } else { // musiciens de rue
    for (const dx of [-0.15, 0.15]) {
      const f = new THREE.Mesh(figureGeo({ body: pickC(LOOKS.body), legs: pickC(LOOKS.legs), skin: pickC(LOOKS.skin), hair: pickC(LOOKS.hair) }), mats.solid);
      f.position.set(dx, 0, 0); g.add(f);
    }
    add3(new THREE.BoxGeometry(0.06, 0.12, 0.03).translate(0.2, 0.22, 0.06), 0x8a5a3c);
  }
  g.position.set(spot.x, 0.08, spot.y);
  g.userData.noTap = true;
  return g;
}
function updateStands() {
  const list = (opts.festSpots && opts.festSpots()) || [];
  const keep = new Set();
  for (const s of list) {
    const k = `${s.fest}:${s.x},${s.y}`;
    keep.add(k);
    if (!stands.has(k)) { const m = standMesh(s); scene.add(m); stands.set(k, m); }
  }
  for (const [k, m] of stands) if (!keep.has(k)) { scene.remove(m); stands.delete(k); }
}

let aliveTick = 0;
function updateAlive(dt) {
  const rate = opts.demo ? speed : (world.paused ? 0 : (world.speed || 1));
  updateWalkers(dt, rate);
  if (rate > 0) updatePigeons(dt);
  aliveTick -= dt;
  if (aliveTick <= 0) { aliveTick = 1; applySeason(); updateSnow(); updateLitter(); updateStands(); }
}

const clock = new THREE.Clock();
let speed = 1, frames = 0, fpsT = 0;
const $ = id => document.getElementById(id);
if (opts.demo) $('speed').onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 16 : 1; $('speed').textContent = `⏩ ×${speed}`; };
if (opts.demo) $('night').onclick = () => { forceNight = !forceNight; if (forceNight) { while (world.hour < 21 || world.hour > 22) world.step(1); } $('night').textContent = forceNight ? '☀️ Jour' : '🌙 Nuit'; if (!forceNight) while (world.hour < 10 || world.hour > 11) world.step(1); };

let dirty = true, acc = 0;
controls.addEventListener('change', () => { dirty = true; });
function loop() {
  // Économie de batterie : 30 images/s au plus ; en pause, on ne redessine que si la caméra bouge
  const raw = clock.getDelta();
  acc += raw;
  if (!opts.demo && opts.saver && acc < 1 / 30) { requestAnimationFrame(loop); return; }
  const dt = Math.min(acc, 0.1); acc = 0;
  if (!opts.demo && world.paused && !dirty && !camGoal.t) { controls.update(); requestAnimationFrame(loop); return; }
  dirty = false;
  if (opts.demo) world.update(dt * 1000 * speed);
  const inside = !opts.demo && opts.player && opts.player.inside != null;
  renderer.domElement.style.display = inside ? 'none' : '';
  if (pinsEl) pinsEl.style.display = inside ? 'none' : '';
  if (inside) { requestAnimationFrame(loop); return; }
  updateCars(dt * Math.min(opts.demo ? speed : (world.paused ? 0 : (world.speed || 1)), 4));
  for (const a of world.actors) {
    let v = people.get(a.id);
    if (!v) { v = personView(a); people.set(a.id, v); }
    const show = a.outdoors;
    v.g.visible = show;
    if (!show) continue;
    const mx = a.px - v.last.x, my = a.py - v.last.y;
    const moving = Math.hypot(mx, my) > 0.0005;
    if (moving) v.g.rotation.y = Math.atan2(mx, my);
    v.last.x = a.px; v.last.y = a.py;
    v.phase += dt * (moving ? 14 : 2);
    v.g.position.set(a.px, 0.08 + (moving ? Math.abs(Math.sin(v.phase)) * 0.02 : 0), a.py);
  }
  for (const [id, v] of people) if (!world.actorById(id)) { scene.remove(v.g); people.delete(id); }
  lighting();
  updateLights();
  controls.update();
  renderer.render(scene, camera);
  if (opts.demo) {
  const hh = Math.floor(world.hour), mm = Math.floor((world.hour % 1) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · J${world.day}`;
  frames++; fpsT += dt;
  if (fpsT > 1) { $('fps').textContent = `${Math.round(frames / fpsT)} img/s · ${renderer.info.render.calls} dessins`; frames = 0; fpsT = 0; }
  }
  updateAlive(dt);
  updateGame(dt);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.three = { scene, sun, hemi, renderer, mats, camera, controls }; // débogage (console)
loop();
return api;
}
