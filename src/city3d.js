// Démo 3D « low-poly » du Marais : même plan, mêmes habitants (la simulation tourne pour de vrai),
// rendu Three.js moderne (lumière du soleil, ombres douces, cycle jour / nuit, fenêtres allumées le soir).
// Optimisé pour le téléphone : géométries fusionnées par matériau, arbres et lampadaires instanciés (≈ 20 appels de dessin pour la ville).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
import { cityPulse } from './city/common.js';
import { createInterior3D } from './interior3d.js';
import { settings, onSettings } from './settings.js';
import { figurePose, FIGURE_MAT, WALK_FRAMES } from './figure3d.js';
import { t as tr } from './i18n.js';

import { TYPES } from './map/types.js';
import { PIN_GLYPHS } from './icons.js';
import { freeUnits, isClosed } from './sim/city.js';
import { sellerAt, openings } from './sim/jobs.js';

// Lance le rendu 3D de la ville. opts.demo : page de démo (HUD propre, la simulation avance ici) ;
// sinon mode jeu : opts.player, onPlace(b), onPerson(a), onGround(x, y), onFiller(), saver.
export function startCity3D(world, opts = {}) {
const map = world.map;

// ---------- Moteur ----------
const mobile = matchMedia('(pointer: coarse)').matches;
// Téléphone : anticrénelage matériel (les bords ne scintillent plus) et résolution qui s'adapte à la fluidité
// (on commence net, on baisse un peu si l'image rame, on remonte quand ça va mieux)
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// Téléphone : résolution fixe et modérée (l'anticrénelage lisse les bords) — c'est elle qui fait chauffer le plus
const PR_MAX = Math.min(devicePixelRatio, mobile ? 1.15 : 1.75), PR_MIN = Math.min(devicePixelRatio, mobile ? 0.9 : 1);
let pixelRatio = Math.min(devicePixelRatio, mobile ? 1.15 : 1.5); // (l'anticrénelage garde les bords lisses ; on monte si l'appareil suit)
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
const adaptive = { t: 0, frames: 0, calm: 0, slow: 0, level: 0 };
renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // (ombres douces : trop coûteuses au téléphone)
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
if (opts.demo) document.body.appendChild(renderer.domElement);
else { const cv = renderer.domElement; cv.id = 'city3d'; document.body.insertBefore(cv, document.getElementById('game')); }
if (opts.saver) { renderer.shadowMap.enabled = false; pixelRatio = 1; renderer.setPixelRatio(1); }

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
if (opts.demo) camera.position.set(CX + 20, 22, CZ + 20);
else camera.position.set(CX + (mobile ? 6 : 8.5), mobile ? 7 : 9.5, CZ + (mobile ? 6 : 8.5)); // jeu : vue rapprochée sur ton personnage
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(CX, 0, CZ);
controls.enableDamping = true;
controls.dampingFactor = mobile ? 0.15 : 0.1;
// Sensibilité : plus douce au doigt (tourner et zoomer trop vite donne le tournis)
// (multipliée par le réglage ⚙️ → Confort → Caméra)
const CAM_BASE = { rot: mobile ? 0.22 : 0.4, pan: mobile ? 0.55 : 0.8, zoom: mobile ? 0.45 : 0.7 }; // (plus lent : demandé)
function applyCamSettings() {
  const st = settings();
  controls.rotateSpeed = CAM_BASE.rot * (st.camRotate ?? 1);
  controls.panSpeed = CAM_BASE.pan * (st.camPan ?? 1);
  controls.zoomSpeed = CAM_BASE.zoom * (st.camZoom ?? 1);
}
applyCamSettings();
controls.screenSpacePanning = false;
controls.minDistance = 6; controls.maxDistance = 75;
controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.32; // (de presque au-dessus à presque à hauteur des rues)
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
let interiorOn = false;
controls.addEventListener('change', () => { // on reste au-dessus du quartier
  if (interiorOn) return;
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
const shade = (c, k) => { const o = new THREE.Color(c); o.multiplyScalar(k); return o.getHex(); };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
// Toit à la Mansart : tronc de pyramide (zinc / ardoise)
function mansard(w, d, h, inset, x, y, z) {
  const a = w / 2, b = d / 2, i = inset;
  const v = [
    -a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b,                     // base
    -a + i, h, -b + i, a - i, h, -b + i, a - i, h, b - i, -a + i, h, b - i, // sommet
  ];
  // (pans tournés vers l'extérieur : sinon ils sont invisibles ou mal éclairés)
  const idx = [4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4];
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
// ---------- Autres styles d'immeubles (pour qu'ils ne se ressemblent pas tous) ----------
// Même découpage que la façade haussmannienne : 4 travées × 4 étages par motif (une case = une fenêtre).
// old = vieille pierre à volets (Marais XVIIe) · brick = brique rouge d'atelier · timber = colombages · modern = béton et grandes baies
const STYLE_DRAW = {
  old: (g, S, glow) => {
    const c = S / 4;
    if (!glow) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random() * S, Math.random() * S, 3, 2); } }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * c, y = fy * c;
      if (glow) { if (LIT[(fy * 4 + bx + 5) % 16]) { g.fillStyle = '#ffd890'; g.fillRect(x + c * 0.36, y + c * 0.26, c * 0.28, c * 0.5); } continue; }
      g.fillStyle = '#ece6da'; g.fillRect(x + c * 0.32, y + c * 0.22, c * 0.36, c * 0.58);       // encadrement de pierre
      g.fillStyle = '#3a4456'; g.fillRect(x + c * 0.36, y + c * 0.26, c * 0.28, c * 0.5);        // vitre (plus étroite)
      g.fillStyle = '#ece6da'; g.fillRect(x + c * 0.36, y + c * 0.48, c * 0.28, c * 0.02);
      g.fillStyle = '#4f6b52'; g.fillRect(x + c * 0.18, y + c * 0.24, c * 0.13, c * 0.54); g.fillRect(x + c * 0.69, y + c * 0.24, c * 0.13, c * 0.54); // volets
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 1; k < 6; k++) { g.fillRect(x + c * 0.18, y + c * (0.24 + k * 0.09), c * 0.13, 2); g.fillRect(x + c * 0.69, y + c * (0.24 + k * 0.09), c * 0.13, 2); }
    }
  },
  brick: (g, S, glow) => {
    const c = S / 4;
    if (!glow) {
      g.fillStyle = '#d9cfc4'; g.fillRect(0, 0, S, S);                                   // joints
      const bh = S / 32, bw = S / 12;
      for (let r = 0; r < 32; r++) for (let k = -1; k < 13; k++) {
        const v = 0.85 + Math.random() * 0.3;
        g.fillStyle = `rgb(${Math.round(176 * v)},${Math.round(82 * v)},${Math.round(60 * v)})`;
        g.fillRect(k * bw + (r % 2) * bw / 2 + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * c, y = fy * c;
      if (glow) { if (LIT[(fy * 4 + bx + 9) % 16]) { g.fillStyle = '#ffe2a8'; g.fillRect(x + c * 0.16, y + c * 0.18, c * 0.68, c * 0.62); } continue; }
      g.fillStyle = '#efe8dc'; g.fillRect(x + c * 0.12, y + c * 0.12, c * 0.76, c * 0.06);       // linteau clair
      g.fillStyle = '#2e3542'; g.fillRect(x + c * 0.16, y + c * 0.18, c * 0.68, c * 0.62);       // verrière d'atelier
      g.fillStyle = '#596273'; for (let k = 1; k < 4; k++) g.fillRect(x + c * (0.16 + k * 0.17), y + c * 0.18, 2, c * 0.62);
      for (let k = 1; k < 3; k++) g.fillRect(x + c * 0.16, y + c * (0.18 + k * 0.2), c * 0.68, 2);
      g.fillStyle = '#efe8dc'; g.fillRect(x + c * 0.12, y + c * 0.8, c * 0.76, c * 0.04);
    }
  },
  timber: (g, S, glow) => {
    const c = S / 4;
    if (!glow) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#5b3a24';
      for (let fy = 0; fy <= 4; fy++) g.fillRect(0, fy * c - 5, S, 10);                          // sablières (à chaque étage)
      for (let bx = 0; bx <= 4; bx++) g.fillRect(bx * c - 4, 0, 8, S);                           // poteaux
      g.lineWidth = 7; g.strokeStyle = '#5b3a24';
      for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {                             // croix de Saint-André sous les fenêtres
        const x = bx * c, y = fy * c; g.beginPath(); g.moveTo(x + 6, y + c - 6); g.lineTo(x + c * 0.3, y + c * 0.78); g.moveTo(x + c - 6, y + c - 6); g.lineTo(x + c * 0.7, y + c * 0.78); g.stroke();
      }
    }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * c, y = fy * c;
      if (glow) { if (LIT[(fy * 4 + bx + 3) % 16]) { g.fillStyle = '#ffcf7a'; g.fillRect(x + c * 0.32, y + c * 0.24, c * 0.36, c * 0.44); } continue; }
      g.fillStyle = '#5b3a24'; g.fillRect(x + c * 0.28, y + c * 0.2, c * 0.44, c * 0.52);
      g.fillStyle = '#4a5468'; g.fillRect(x + c * 0.32, y + c * 0.24, c * 0.36, c * 0.44);
      g.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 1; k < 3; k++) { g.fillRect(x + c * (0.32 + k * 0.12), y + c * 0.24, 1.5, c * 0.44); g.fillRect(x + c * 0.32, y + c * (0.24 + k * 0.15), c * 0.36, 1.5); }
    }
  },
  modern: (g, S, glow) => {
    const c = S / 4;
    if (!glow) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * c, y = fy * c;
      if (glow) { if (LIT[(fy * 4 + bx + 11) % 16]) { g.fillStyle = '#fff0d0'; g.fillRect(x + c * 0.04, y + c * 0.14, c * 0.92, c * 0.7); } continue; }
      const grd = g.createLinearGradient(x, y, x + c, y + c); grd.addColorStop(0, '#7fa6c8'); grd.addColorStop(1, '#3f5f80');
      g.fillStyle = grd; g.fillRect(x + c * 0.04, y + c * 0.14, c * 0.92, c * 0.7);               // grande baie
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + c * 0.04, y + c * 0.14, c * 0.92, c * 0.08);
      g.fillStyle = '#2b2f36'; g.fillRect(x + c * 0.49, y + c * 0.14, 3, c * 0.7);
    }
  },
};
const STYLE_MATS = {};
for (const [k, draw] of Object.entries(STYLE_DRAW)) {
  const map = canvasTex(512, (g, S) => draw(g, S, false));
  const glow = canvasTex(512, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); draw(g, S, true); });
  STYLE_MATS[k] = new THREE.MeshStandardMaterial({ vertexColors: true, map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: k === 'modern' ? 0.55 : 0.88 });
}
const STYLE_GEOS = { old: [], brick: [], timber: [], modern: [] };
// Couleurs (multipliées par la texture) : enduits du Marais, briques plus ou moins sombres, béton clair
const STYLE_COLORS = {
  old: [0xf3ead6, 0xeedcb8, 0xe9d3c0, 0xe2e0d6, 0xf0dcae],
  brick: [0xffffff, 0xf0dcd2, 0xe2c8bc, 0xfff0e6],
  timber: [0xf6eedd, 0xf2e2bf, 0xeadfcf, 0xf4e6d0],
  modern: [0xe8eaec, 0xd9dde2, 0xf2efe9, 0xdfe6e3],
};
// Style d'un immeuble ordinaire selon sa graine : moitié haussmannien, le reste varié
function styleOf(seed) {
  const k = ((seed * 2654435761) >>> 0) % 20;
  return k < 9 ? 'haus' : k < 13 ? 'old' : k < 16 ? 'brick' : k < 18 ? 'timber' : 'modern';
}
// Toit à deux pans (faîtage le long du grand côté) : pans au toit, pignons triangulaires au mur
function gable(w, d, h, x, y, z) {
  const a = w / 2, b = d / 2, alongX = w >= d;
  const v = alongX ? [-a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b, -a, h, 0, a, h, 0] : [-a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b, 0, h, -b, 0, h, b];
  const slopes = alongX ? [0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4] : [0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2];
  const ends = alongX ? [0, 3, 4, 1, 5, 2] : [0, 4, 1, 3, 2, 5];
  const mk = idx => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); const n = g.toNonIndexed(); n.computeVertexNormals(); return n.translate(x, y, z); };
  return { slopes: mk(slopes), ends: mk(ends) };
}
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
const groundGeos = [], markGeos = [], roadGeos = [], grassGeos = [], bikeGeos = [];
const noiseTex = (base, n, size = 128) => canvasTex(size, (g, S) => {
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
});
const paverTex = canvasTex(128, (g, S) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, k * S / 4); g.lineTo(S, k * S / 4); g.stroke(); }
  for (let r = 0; r < 4; r++) for (let k = 0; k <= 2; k++) { const x = (k + (r % 2) * 0.5) * S / 2; g.beginPath(); g.moveTo(x, r * S / 4); g.lineTo(x, (r + 1) * S / 4); g.stroke(); }
  for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
});
const asphaltTex = noiseTex('#ffffff', 900);
const grassTex = canvasTex(128, (g, S) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) { g.fillStyle = ['rgba(30,90,30,0.18)', 'rgba(255,255,255,0.15)', 'rgba(255,240,120,0.25)'][i % 3]; g.fillRect(Math.random() * S, Math.random() * S, 2, 3); }
});
const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTex, roughness: 0.95 });
const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 });
mats.ground.map = paverTex; mats.ground.needsUpdate = true;
const GROUND = {
  pave: [0xd9cdb5, 0xa9a297, 0.08], cobble: [0xc4b393, 0x9c8f78, 0.08], grass: [0x6db35b, 0x5d8243, 0.1], road: [0x4e5361, 0x4e5361, 0.0],
  gravel: [0xe4d7b6, 0xbfae8a, 0.07],
};
const pondGeos = [], rimGeos = [];
const RW = 0.16; // élargissement de la chaussée de chaque côté (piste cyclable)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.ground === 'water') continue;
  if (t.ground === 'pond') { // étang du parc : fond sombre, eau, margelle de pierre
    groundGeos.push(paint(box(1, 0.03, 1, x, -0.02, y), 0x34503f));
    pondGeos.push(box(1, 0.02, 1, x, 0.03, y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = T(x + dx, y + dy);
      if (n && n.ground === 'pond') continue;
      rimGeos.push(paint(dy ? box(1.12, 0.13, 0.14, x, 0, y + dy * 0.5) : box(0.14, 0.13, 1.12, x + dx * 0.5, 0, y), 0xa39c8e, 0xc9c2b2));
    }
    continue;
  }
  // terrain d'une maison : pelouse autour (la maison est un peu plus petite que sa parcelle)
  const lawn = t.building != null && map.buildings[t.building].style === 'house';
  const gdef = lawn ? GROUND.grass : GROUND[t.ground] || GROUND.pave;
  const h = gdef[2] + (t.ground === 'road' && t.avenue ? 0.001 : 0);
  // les cases au bord de la Seine descendent jusqu'à l'eau (quai)
  const quay = T(x, y - 1) && T(x, y - 1).ground === 'water';
  // Chaussée élargie : le trottoir recule de RW du côté de la rue (place pour la piste cyclable)
  const rd = (xx, yy) => T(xx, yy) && T(xx, yy).ground === 'road';
  let sE = 0, sW = 0, sS = 0, sN = 0;
  if (t.ground !== 'road') {
    sE = rd(x + 1, y) ? RW : 0; sW = rd(x - 1, y) ? RW : 0; sS = rd(x, y + 1) ? RW : 0; sN = rd(x, y - 1) ? RW : 0;
    if (sE) roadGeos.push(paint(box(RW, 0.02, 1, x + 0.5 - RW / 2, -0.02, y), 0x4e5361));
    if (sW) roadGeos.push(paint(box(RW, 0.02, 1, x - 0.5 + RW / 2, -0.02, y), 0x4e5361));
    if (sS) roadGeos.push(paint(box(1, 0.02, RW, x, -0.02, y + 0.5 - RW / 2), 0x4e5361));
    if (sN) roadGeos.push(paint(box(1, 0.02, RW, x, -0.02, y - 0.5 + RW / 2), 0x4e5361));
  }
  const g = box(1 - sE - sW, h + 0.02 + (quay ? 0.25 : 0), 1 - sS - sN, x + (sW - sE) / 2, -0.02 - (quay ? 0.25 : 0), y + (sN - sS) / 2);
  paint(g, quay ? 0xcfc6b4 : gdef[1], t.ground === 'road' && (x + y) % 2 ? 0x595e6c : gdef[0]);
  (t.ground === 'road' ? roadGeos : t.ground === 'grass' || t.ground === 'gravel' || lawn ? grassGeos : groundGeos).push(g);
}
if (pondGeos.length) { const pm = new THREE.Mesh(mergeGeometries(pondGeos), mats.water); pm.receiveShadow = true; scene.add(pm); }
add(rimGeos, mats.solid);
add(groundGeos, mats.ground, { cast: false });
add(roadGeos, roadMat, { cast: false });
add(grassGeos, grassMat, { cast: false });
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
  // Pistes cyclables vertes le long des trottoirs (bande blanche côté voitures, vélo peint de temps en temps)
  for (const sgn of [1, -1]) {
    const curb = alongX ? !roadAt(x, y + sgn) : !roadAt(x + sgn, y);
    if (!curb || t.crossing) continue;
    const o = sgn * (0.5 + RW - 0.115);
    bikeGeos.push(alongX ? box(1, 0.004, 0.17, x, 0.006, y + o) : box(0.17, 0.004, 1, x + o, 0.006, y));
    const ol = sgn * (0.5 + RW - 0.215);
    markGeos.push(alongX ? box(1, 0.005, 0.018, x, 0.006, y + ol) : box(0.018, 0.005, 1, x + ol, 0.006, y));
    if ((x + y) % 3 === 0) { // pictogramme : deux roues et un cadre
      for (const w of [-0.06, 0.06]) markGeos.push(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 10).translate(alongX ? x + w : x + o, 0.009, alongX ? y + o : y + w));
      markGeos.push(alongX ? box(0.12, 0.005, 0.012, x, 0.007, y + o) : box(0.012, 0.005, 0.12, x + o, 0.007, y));
    }
  }
  if (t.crossing) {
    for (let k = 0; k < 6; k++) {
      const o = -0.42 + k * 0.17;
      markGeos.push(alongX ? box(0.62, 0.004, 0.09, x, yy, y + o) : box(0.09, 0.004, 0.62, x + o, yy, y));
    }
  } else if (t.avenue) {
    for (const o of [-0.035, 0.035]) markGeos.push(alongX ? box(1, 0.004, 0.025, x, yy, y + o) : box(0.025, 0.004, 1, x + o, yy, y));
  } else if ((x + y) % 2 === 0) {
    markGeos.push(alongX ? box(0.42, 0.004, 0.04, x, yy, y) : box(0.04, 0.004, 0.42, x, yy, y));
  }
}
add(markGeos, mats.marks, { cast: false });
add(bikeGeos, new THREE.MeshStandardMaterial({ color: 0x3f9d63, roughness: 0.85 }), { cast: false });

// ---------- Immeubles ----------
const TYPE_FLOORS = { home: 6, office: 9, cafe: 5, bakery: 5, shop: 5, fashion: 5, garage: 2, metro: 0, cityhall: 4, police: 4, hospital: 7, firestation: 3, prison: 3, school: 4, court: 4, bank: 5, gym: 3 };
const SHOP_COLOR = { gym: 0xf08a3c, cafe: 0xc9453f, bakery: 0xd9922b, shop: 0x2f9e5f, fashion: 0xd94f9c, bank: 0x1f6a4a, garage: 0x2f7d8b };
// Pierre de Paris, mais avec du caractère : crème, ocre, rose poudré, gris bleuté, sauge, beurre, terre cuite, lavande
const STONE = [0xf1e2c4, 0xe8c597, 0xf0cdbf, 0xd6e0e7, 0xeedcb4, 0xcfdcc8, 0xf6e8d2, 0xe5b394, 0xddd2e6, 0xf3dea0, 0xe9d7c3, 0xc9d6dc];
const PUBLIC = { cityhall: 0xf4ecda, police: 0xe3e8f0, hospital: 0xf7f8fa, firestation: 0xc65a46, prison: 0xb9b6ae, school: 0xf3e3c3, court: 0xe8eaee };
const ROOFS = [0x6f7d8f, 0x5f6b7c, 0x7a8798, 0x566173, 0x4a5568, 0x8f9bb0];
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
  prison: ['MAISON D’ARRÊT', '#4a4b50'], gym: ['SALLE DE SPORT', '#d9622b'], office: ['BUREAUX', '#2d3e5c'], metro: ['MÉTRO', '#2f7352', '#f6d860'],
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
const aoRects = [];
const tops = {}; // hauteur du toit de chaque lieu (pour les épingles)
function building(r, type, seed, bid = null, floorsOverride = null) {
  const x = r.x0 + r.w / 2 - 0.5, z = r.y0 + r.h / 2 - 0.5;
  let w = r.w - 0.04, d = r.h - 0.04;
  aoRects.push([x, z, w, d]);
  const floors = floorsOverride ?? TYPE_FLOORS[type] ?? 6;
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
  const plainType = !PUBLIC[type] && !SHOP_COLOR[type] && type !== 'gym' || type === 'filler' || type === 'filler-shop';
  const style = plainType ? styleOf(seed) : 'haus';
  const stone = style !== 'haus' ? STYLE_COLORS[style][seed % STYLE_COLORS[style].length] : PUBLIC[type] ?? STONE[seed % STONE.length];
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
  // hauteur selon le style : les vieilles maisons sont basses, les immeubles modernes plus hauts
  const styleFloors = style === 'old' ? Math.min(floors, 4 + (seed % 2)) : style === 'timber' ? Math.min(floors, 3 + (seed % 2)) : style === 'brick' ? Math.max(3, Math.min(floors, 4 + (seed % 3))) : style === 'modern' ? Math.max(floors, 6 + (seed % 3)) : floors;
  const upper = Math.max(1, styleFloors - (y > base ? 1 : 0));
  const h = upper * FLOOR;
  // Silhouettes variées : un immeuble sur trois a un dernier étage en retrait (terrasse filante) ;
  // chaînes d'angle en pierre plus claire pour bien lire les volumes
  const plain = !PUBLIC[type] && !SHOP_COLOR[type] || type === 'filler' || type === 'filler-shop';
  const attic = plain && style === 'haus' && upper >= 4 && seed % 3 === 0;
  const hMain = attic ? h - FLOOR : h;
  const wallArr = style === 'haus' ? wallGeos : STYLE_GEOS[style];
  if (style === 'timber' && hMain > FLOOR) { // colombages : les étages débordent au-dessus du rez-de-chaussée (encorbellement)
    wallArr.push(paint(wallUV(box(w - 0.06, FLOOR, d - 0.06, x, y, z), w - 0.06, FLOOR, d - 0.06, y - base), stone));
    wallArr.push(paint(wallUV(box(w + 0.06, hMain - FLOOR, d + 0.06, x, y + FLOOR, z), w + 0.06, hMain - FLOOR, d + 0.06, y + FLOOR - base), stone));
    solidGeos.push(paint(box(w + 0.1, 0.05, d + 0.1, x, y + FLOOR - 0.02, z), 0x5b3a24));
  } else wallArr.push(paint(wallUV(box(w, hMain, d, x, y, z), w, hMain, d, y - base), stone));
  if (style === 'modern') for (let k = 1; k <= upper; k++) solidGeos.push(paint(box(w + 0.05, 0.03, d + 0.05, x, y + k * FLOOR - 0.03, z), 0xf4f4f2)); // dalles en bandeau
  if (attic) {
    const aw = w - 0.26, ad = d - 0.26;
    wallGeos.push(paint(wallUV(box(aw, FLOOR, ad, x, y + hMain, z), aw, FLOOR, ad, y + hMain - base), shade(stone, 1.03)));
    solidGeos.push(paint(box(w + 0.06, 0.05, d + 0.06, x, y + hMain, z), 0xe2d8c4)); // corniche de la terrasse
    for (const [bw, bd, ox, oz] of [[w, 0.015, 0, d / 2 - 0.01], [w, 0.015, 0, -d / 2 + 0.01], [0.015, d, w / 2 - 0.01, 0], [0.015, d, -w / 2 + 0.01, 0]]) {
      solidGeos.push(paint(box(bw, 0.09, bd, x + ox, y + hMain + 0.05, z + oz), 0x2a2c33)); // garde-corps
    }
    // jardinières sur la terrasse
    for (let k = 0; k < 3; k++) solidGeos.push(paint(box(0.12, 0.08, 0.08, x - w / 2 + 0.2 + k * (w - 0.4) / 2, y + hMain + 0.05, z + d / 2 - 0.08), 0x9a5b3c, 0x5aa04a));
  }
  if ((plain && type !== 'filler-shop' || type === 'filler') && (style === 'haus' || style === 'old')) {
    for (const [ox, oz] of [[w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]]) {
      solidGeos.push(paint(box(0.06, hMain, 0.06, x + ox, y, z + oz), shade(stone, 1.08)));
    }
  }
  // Détails haussmanniens : soubassement de pierre, bandeau au-dessus du rez-de-chaussée,
  // balcons filants en fer forgé au 2e et au dernier étage (sur tout le tour de l'immeuble)
  const wallBase = y;
  if (wallBase === base) solidGeos.push(paint(box(w + 0.03, 0.14, d + 0.03, x, base, z), shade(stone, 0.82)));
  solidGeos.push(paint(box(w + 0.05, 0.035, d + 0.05, x, wallBase === base ? base + FLOOR : wallBase, z), shade(stone, 1.05)));
  if (upper >= 3 && style === 'haus') {
    for (const lvl of [wallBase + FLOOR * (wallBase === base ? 2 : 1), wallBase + h - FLOOR].slice(0, attic ? 1 : 2)) {
      solidGeos.push(paint(box(w + 0.12, 0.025, d + 0.12, x, lvl, z), shade(stone, 0.95)));          // dalle du balcon
      for (const [bw, bd, ox, oz] of [[w + 0.12, 0.012, 0, d / 2 + 0.06], [w + 0.12, 0.012, 0, -d / 2 - 0.06], [0.012, d + 0.12, w / 2 + 0.06, 0], [0.012, d + 0.12, -w / 2 - 0.06, 0]]) {
        solidGeos.push(paint(box(bw, 0.075, bd, x + ox, lvl + 0.025, z + oz), 0x2a2c33));             // garde-corps
      }
    }
  }
  y += h;
  const bw = w, bd = d; // emprise au sol (enseignes, landmark)
  if (attic) { w -= 0.26; d -= 0.26; } // le toit coiffe l'étage en retrait
  // Toit-terrasse végétalisé sur un immeuble ordinaire sur cinq (sinon toit à la Mansart en zinc ou ardoise)
  const garden = plain && !attic && (style === 'haus' ? seed % 5 === 1 : style === 'modern' && seed % 2 === 0);
  const flat = style === 'brick' || (style === 'modern' && !garden);
  const pitched = style === 'old' || style === 'timber';
  // corniche + toit, cheminées
  solidGeos.push(paint(box(w + 0.08, 0.06, d + 0.08, x, y, z), style === 'brick' ? shade(0xb5583f, 0.9) : style === 'timber' ? 0x5b3a24 : style === 'modern' ? 0xf4f4f2 : 0xd8cfbd));
  y += 0.06;
  const roofH = flat ? 0.1 : style === 'timber' ? 0.75 : style === 'old' ? 0.6 : garden ? 0.06 : type === 'firestation' || type === 'prison' ? 0.12 : 0.5;
  const rcol = ROOF_BY_TYPE[type] ?? ROOFS[seed % ROOFS.length]; // les lieux importants ont un toit de couleur reconnaissable
  if (garden) {
    solidGeos.push(paint(box(w - 0.04, 0.05, d - 0.04, x, y, z), 0x9aa0aa));                            // dalle
    solidGeos.push(paint(box(w - 0.3, 0.06, d - 0.3, x, y + 0.02, z), 0x5d9a4a, 0x6db35b));             // pelouse
    for (let k = 0; k < 3; k++) {
      const bx = x - (w - 0.5) / 2 + k * (w - 0.5) / 2, bz = z + ((seed + k) % 2 ? 0.15 : -0.15) * (d - 0.4);
      solidGeos.push(paint(new THREE.SphereGeometry(0.09, 7, 5).translate(bx, y + 0.15, bz), 0x3f8f45));
    }
    solidGeos.push(paint(box(0.02, 0.22, 0.02, x + 0.1, y + 0.05, z), 0xdddddd));                       // parasol
    solidGeos.push(paint(new THREE.ConeGeometry(0.16, 0.07, 8).translate(x + 0.1, y + 0.3, z), [0xe2475b, 0xf2c94c, 0x3d6fd8][seed % 3]));
    for (const [bw2, bd2, ox, oz] of [[w, 0.015, 0, d / 2], [w, 0.015, 0, -d / 2], [0.015, d, w / 2, 0], [0.015, d, -w / 2, 0]]) {
      solidGeos.push(paint(box(bw2, 0.08, bd2, x + ox, y, z + oz), 0x2a2c33));                          // garde-corps
    }
  } else if (flat) {
    // toit plat : muret tout autour, château d'eau ou verrières (brique), climatiseurs (moderne)
    const pc = style === 'brick' ? shade(0xb5583f, 0.85) : 0xe6e6e2;
    solidGeos.push(paint(box(w - 0.02, 0.04, d - 0.02, x, y, z), 0x8f949c));
    for (const [pw, pd, ox, oz] of [[w, 0.06, 0, d / 2 - 0.03], [w, 0.06, 0, -d / 2 + 0.03], [0.06, d, w / 2 - 0.03, 0], [0.06, d, -w / 2 + 0.03, 0]]) solidGeos.push(paint(box(pw, 0.12, pd, x + ox, y, z + oz), pc));
    if (style === 'brick' && seed % 2 === 0) { // château d'eau en bois sur pieds
      const tx = x + (w / 2 - 0.35) * (seed % 4 < 2 ? 1 : -1);
      for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) solidGeos.push(paint(box(0.025, 0.25, 0.025, tx + ox, y, z + oz), 0x3a3a40));
      solidGeos.push(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 12).translate(tx, y + 0.4, z), 0x8a5a3c));
      solidGeos.push(paint(new THREE.ConeGeometry(0.19, 0.14, 12).translate(tx, y + 0.62, z), 0x4a4a52));
    } else if (style === 'brick') { // verrières en dents de scie
      for (let k = 0; k < 3; k++) solidGeos.push(paint(new THREE.BoxGeometry(w * 0.7, 0.14, 0.05).rotateX(-0.6).translate(x, y + 0.1, z - d * 0.25 + k * d * 0.25), 0x9fc4e8));
    } else { // climatiseurs et cage d'escalier
      solidGeos.push(paint(box(0.3, 0.22, 0.3, x - w * 0.2, y, z + d * 0.15), 0xd0d4da));
      for (let k = 0; k < 2; k++) solidGeos.push(paint(box(0.16, 0.1, 0.12, x + w * 0.15 + k * 0.2, y + 0.02, z - d * 0.2), 0xb9bec6));
    }
  } else if (pitched) {
    // toit à deux pans : ardoise (vieille pierre) ou tuiles (colombages), qui déborde un peu
    const gr = gable(w + 0.14, d + 0.14, roofH, x, y, z);
    roofGeos.push(paint(gr.slopes, style === 'timber' ? [0x9c4a32, 0x8a4a36, 0xa5573a][seed % 3] : [0x4a5160, 0x3f4552, 0x56606f][seed % 3]));
    roofGeos.push(paint(gr.ends, stone)); // (pignons : même format que les toits, non indexé)
  } else roofGeos.push(paint(mansard(w + 0.02, d + 0.02, roofH, Math.min(0.32, Math.min(w, d) * 0.3), x, y, z), rcol));
  if (bid != null) tops[bid] = Math.max(tops[bid] || 0, y + roofH);
  if (bid != null) landmark(type, r, x, z, bw, bd, base, y);
  // Lucarnes dans le toit en zinc (petites fenêtres à fronton), réparties sur les longs côtés
  if (roofH > 0.2 && style !== 'timber') {
    const inset = Math.min(0.32, Math.min(w, d) * 0.3);
    const along = w >= d;
    const len = along ? w : d, n = Math.max(1, Math.floor(len / 0.55));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n - 0.5;
      for (const sgn of [1, -1]) {
        const dx = along ? t * (len - 0.3) : sgn * (w / 2 - inset * 0.55);
        const dz = along ? sgn * (d / 2 - inset * 0.55) : t * (len - 0.3);
        // (toNonIndexed : les toits à la Mansart sont « non indexés », il faut le même format pour les fusionner)
        roofGeos.push(paint(box(along ? 0.13 : 0.1, 0.15, along ? 0.1 : 0.13, x + dx, y + roofH * 0.18, z + dz), 0xe9e4da).deleteAttribute('uv').toNonIndexed());
        roofGeos.push(paint(box(along ? 0.09 : 0.02, 0.09, along ? 0.02 : 0.09, x + dx + (along ? 0 : sgn * 0.051), y + roofH * 0.18 + 0.03, z + dz + (along ? sgn * 0.051 : 0)), 0x3f4d63).deleteAttribute('uv').toNonIndexed());
      }
    }
  }
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

// ---------- Maisons individuelles (quartier des Jardins) ----------
// Façade de maison : une fenêtre sur deux, volets peints, appuis ; 3 couleurs de volets
function houseTex(shutter) {
  return canvasTex(256, (g, S) => {
    const c = S / 4;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      if ((bx + fy) % 2) continue;
      const x = bx * c, y = fy * c;
      g.fillStyle = '#f4efe6'; g.fillRect(x + c * 0.3, y + c * 0.22, c * 0.4, c * 0.56);
      g.fillStyle = '#41506a'; g.fillRect(x + c * 0.34, y + c * 0.26, c * 0.32, c * 0.48);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + c * 0.34, y + c * 0.26, c * 0.32, c * 0.1);
      g.fillStyle = '#f4efe6'; g.fillRect(x + c * 0.49, y + c * 0.26, c * 0.02, c * 0.48);
      g.fillStyle = shutter; g.fillRect(x + c * 0.13, y + c * 0.22, c * 0.16, c * 0.56); g.fillRect(x + c * 0.71, y + c * 0.22, c * 0.16, c * 0.56);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      for (let k = 1; k < 5; k++) { g.fillRect(x + c * 0.13, y + c * (0.22 + k * 0.11), c * 0.16, 2); g.fillRect(x + c * 0.71, y + c * (0.22 + k * 0.11), c * 0.16, 2); }
      g.fillStyle = '#d9cfbf'; g.fillRect(x + c * 0.27, y + c * 0.78, c * 0.46, c * 0.05);
    }
  });
}
const houseGlow = canvasTex(256, (g, S) => {
  const c = S / 4;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
    if ((bx + fy) % 2 || rnd() < 0.45) continue;
    g.fillStyle = ['#ffcf7a', '#ffe0a8'][(fy + bx) % 2];
    g.fillRect(bx * c + c * 0.34, fy * c + c * 0.26, c * 0.32, c * 0.48);
  }
});
const HOUSE_MATS = ['#4f7bb0', '#5f8a5c', '#a8553a'].map(sh => new THREE.MeshStandardMaterial({ vertexColors: true, map: houseTex(sh), emissiveMap: houseGlow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 }));
const houseGeos = HOUSE_MATS.map(() => []);
const HOUSE_WALL = [0xf6ecd6, 0xf3dfa8, 0xf0cfc4, 0xd7e4ec, 0xdfe8cf, 0xf7f3ea, 0xeed9bd];
const TILE_ROOF = [0xb5543a, 0xa5492f, 0xc2673f, 0x7d5a4f, 0x9c4a3a];
function house(r, seed, bid) {
  const x = r.x0 + r.w / 2 - 0.5, z = r.y0 + r.h / 2 - 0.5;
  const w = r.w - 0.34, d = r.h - 0.34; // un peu plus petite que sa parcelle : la pelouse fait le tour
  aoRects.push([x, z, w, d]);
  const base = 0.1, h = 2 * FLOOR * 0.92;
  const wall = HOUSE_WALL[seed % HOUSE_WALL.length];
  houseGeos[seed % HOUSE_MATS.length].push(paint(wallUV(box(w, h, d, x, base, z), w, h, d), wall));
  solidGeos.push(paint(box(w + 0.03, 0.12, d + 0.03, x, base - 0.02, z), shade(wall, 0.78)));          // soubassement
  solidGeos.push(paint(box(w + 0.04, 0.03, d + 0.04, x, base + h / 2, z), shade(wall, 1.04)));          // bandeau entre les étages
  solidGeos.push(paint(box(w + 0.06, 0.04, d + 0.06, x, base + h, z), 0xece4d4));                       // génoise sous le toit
  // toit de tuiles à quatre pans, qui déborde un peu
  const roofH = 0.5 + Math.min(w, d) * 0.1;
  const span = Math.min(w, d) + 0.22;
  roofGeos.push(paint(mansard(w + 0.22, d + 0.22, roofH, span / 2 - 0.01, x, base + h + 0.04, z), TILE_ROOF[seed % TILE_ROOF.length]));
  // cheminée
  const cx = x + (seed % 2 ? 0.25 : -0.25) * Math.max(0.6, w - 1);
  solidGeos.push(paint(box(0.14, 0.4, 0.14, cx, base + h + roofH * 0.35, z + 0.1), 0xb5654a, 0x7a3f2e));
  // porte d'entrée côté rue, petit auvent et marche
  const n = frontOf(r);
  const fx = x + n[0] * (w / 2 + 0.012), fz = z + n[1] * (d / 2 + 0.012);
  const along = n[1] !== 0;
  const doorCol = [0x6b3f2a, 0x2f5d8a, 0x3f6b45, 0x8a2f35][seed % 4];
  solidGeos.push(paint(along ? box(0.22, 0.38, 0.03, fx, base, fz) : box(0.03, 0.38, 0.22, fx, base, fz), doorCol));
  solidGeos.push(paint(along ? box(0.36, 0.03, 0.16, fx, base + 0.44, fz + n[1] * 0.07) : box(0.16, 0.03, 0.36, fx + n[0] * 0.07, base + 0.44, fz), 0x5d4a3e));
  solidGeos.push(paint(along ? box(0.32, 0.05, 0.14, fx, 0.08, fz + n[1] * 0.08) : box(0.14, 0.05, 0.32, fx + n[0] * 0.08, 0.08, fz), 0xbdb5a6));
  // boîte aux lettres au bord du terrain
  solidGeos.push(paint(box(0.03, 0.28, 0.03, fx + (along ? 0.4 : n[0] * 0.25), 0.1, fz + (along ? n[1] * 0.25 : 0.4)), 0x3a3a40));
  solidGeos.push(paint(box(0.1, 0.08, 0.07, fx + (along ? 0.4 : n[0] * 0.25), 0.36, fz + (along ? n[1] * 0.25 : 0.4)), 0xf2c94c));
  if (bid != null) tops[bid] = base + h + roofH + 0.1;
}

let seed = 1;
for (const b of map.buildings) for (const r of rects(b.tiles)) {
  if (b.style === 'house') house(r, seed++ * 7 + b.id, b.id);
  else building(r, b.type, seed++ * 7 + b.id, b.id, b.style === 'village' ? 3 : null); // commerces de quartier : petits immeubles
}
HOUSE_MATS.forEach((m, i) => add(houseGeos[i], m));

// Jardins : haies côté rue, massifs de fleurs, salon de jardin ici et là
const FLOWER = [0xe85d75, 0xf2c94c, 0xffffff, 0xb07ce8, 0xf08a3c];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.deco !== 'garden') continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = T(x + dx, y + dy);
    if (!n || !n.walk) continue;
    solidGeos.push(paint(dy ? box(1, 0.24, 0.16, x, 0.1, y + dy * 0.42) : box(0.16, 0.24, 1, x + dx * 0.42, 0.1, y), 0x3c7a38, 0x4f9446));
  }
  const k = (x * 7 + y * 13) % 5;
  // massif : touffe verte piquée de fleurs 
  for (let i = 0; i < 1 + (k % 2); i++) {
    const fx = x - 0.25 + ((x * 31 + y * 17 + i * 23) % 50) / 100, fz = y - 0.25 + ((x * 11 + y * 29 + i * 41) % 50) / 100;
    solidGeos.push(paint(new THREE.SphereGeometry(0.11, 7, 5).scale(1, 0.7, 1).translate(fx, 0.17, fz), 0x4a8f3f));
    const col = FLOWER[(x + y + i) % FLOWER.length];
    for (const [ox, oz] of [[0.05, 0.02], [-0.04, 0.05], [0.0, -0.06], [-0.06, -0.02]]) {
      solidGeos.push(paint(new THREE.SphereGeometry(0.028, 5, 4).translate(fx + ox, 0.24, fz + oz), col));
    }
  }
  if (k === 3) { // petite table de jardin + chaises
    solidGeos.push(paint(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12).translate(x, 0.3, y), 0xf4f1ea));
    solidGeos.push(paint(box(0.03, 0.2, 0.03, x, 0.1, y), 0x8a8f99));
    for (const o of [-0.22, 0.22]) solidGeos.push(paint(box(0.1, 0.14, 0.1, x + o, 0.1, y), 0xf4f1ea));
  }
}

// Aire de jeux du parc : sable, balançoire, toboggan, bac à sable
{
  const pg = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T(x, y).deco === 'playground') pg.push({ x, y });
  if (pg.length) {
    const x0 = Math.min(...pg.map(p => p.x)), x1 = Math.max(...pg.map(p => p.x)), z0 = Math.min(...pg.map(p => p.y)), z1 = Math.max(...pg.map(p => p.y));
    const cz = (z0 + z1) / 2;
    for (const p of pg) solidGeos.push(paint(box(1, 0.04, 1, p.x, 0.1, p.y), 0xd9c08a, 0xead39c));
    // balançoire (portique bleu, deux sièges rouges)
    const sx = x0 + 0.1;
    for (const ox of [-0.42, 0.42]) for (const oz of [-0.18, 0.18]) solidGeos.push(paint(box(0.05, 0.72, 0.05, sx + ox, 0.12, cz + oz), 0x3d6fd8));
    solidGeos.push(paint(box(0.95, 0.05, 0.05, sx, 0.82, cz), 0x3d6fd8));
    for (const ox of [-0.18, 0.18]) {
      solidGeos.push(paint(box(0.01, 0.42, 0.01, sx + ox - 0.06, 0.4, cz), 0x9aa0aa));
      solidGeos.push(paint(box(0.01, 0.42, 0.01, sx + ox + 0.06, 0.4, cz), 0x9aa0aa));
      solidGeos.push(paint(box(0.17, 0.03, 0.1, sx + ox, 0.37, cz), 0xd8504d));
    }
    // toboggan (tour rouge, glissière jaune)
    const tx = x1 - 0.1;
    solidGeos.push(paint(box(0.32, 0.5, 0.32, tx, 0.12, cz - 0.2), 0xd8504d, 0xf2f2f2));
    solidGeos.push(paint(new THREE.ConeGeometry(0.28, 0.25, 4).rotateY(Math.PI / 4).translate(tx, 0.75, cz - 0.2), 0xf2c94c));
    solidGeos.push(paint(new THREE.BoxGeometry(0.24, 0.03, 0.85).rotateX(0.55).translate(tx, 0.36, cz + 0.33), 0xf2c94c));
    // bac à sable avec un seau
    const bx = (x0 + x1) / 2;
    solidGeos.push(paint(box(0.7, 0.08, 0.6, bx, 0.12, z1 - 0.1), 0xa9774c, 0xf0dca8));
    solidGeos.push(paint(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 8).translate(bx + 0.15, 0.24, z1 - 0.1), 0x4bbf8b));
  }
}
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
for (const k of Object.keys(STYLE_GEOS)) add(STYLE_GEOS[k], STYLE_MATS[k]);
add(shopGeos, mats.shop);
add(glassGeos, mats.glass);
add(roofGeos, mats.roof);
{
  const aoTex = canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 22; g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(S * 0.24, S * 0.24, S * 0.52, S * 0.52);
  }, false);
  const geos = aoRects.map(([x, z, w, d]) => new THREE.PlaneGeometry(w + 0.9, d + 0.9).rotateX(-Math.PI / 2).translate(x, 0.086, z));
  if (geos.length) {
    const ao = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    ao.userData.noTap = true; ao.renderOrder = 1; scene.add(ao);
  }
}

// ---------- Arbres, lampadaires, bancs, fontaines, statue ----------
const trees = [];
const binSpots = []; // poubelles de rue (pour les sacs qui débordent)
const lamps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = T(x, y);
  if (t.deco === 'tree') trees.push([x, y, 1]);
  if (t.deco === 'avtree') { const sd = roadAt(x, y + 1) ? 0.26 : roadAt(x, y - 1) ? -0.26 : 0; trees.push([x, y + sd, 0.85]); }
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
  if (t.ground === 'gravel' && (x + y * 2) % 5 === 0) lamps.push([x + 0.42, y + 0.42]); // lanternes le long des allées du parc
  // lampadaires le long des rues (un sur quatre)
  if (t.walk && (t.ground === 'pave' || t.ground === 'cobble') && !t.deco) {
    const side = roadAt(x, y + 1) ? [0, 0.27] : roadAt(x, y - 1) ? [0, -0.27] : roadAt(x + 1, y) ? [0.27, 0] : roadAt(x - 1, y) ? [-0.27, 0] : null;
    const along = side ? (side[1] ? x : y) : 0;
    if (side && along % 4 === 2) lamps.push([x + side[0], y + side[1]]);
    // poubelles de rue (mêmes places que la vue 2D : on peut les toucher)
    else if (side && t.ground === 'pave' && along % 8 === 5) {
      const bx = x + side[0] * 0.85, bz = y + side[1] * 0.85;
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
const benchSet = new Set(benchList.slice(0, 28)); // (même nombre que streetSpots dans city/common.js)
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
    const px = j.x + dx * 0.76, pz = j.y + dy * 0.76;
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
const FIG_H = 0.4; // hauteur d'un habitant dans la rue
const people = new Map();
const matCache = new Map();
const matOf = c => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); return matCache.get(c); };
function personView(a) {
  const g = new THREE.Group();
  const lk = a.look || {};
  // personnage détaillé (figure3d.js) : un seul maillage, la pose change pour marcher / s'asseoir
  const body = new THREE.Mesh(figurePose(lk), FIGURE_MAT);
  body.scale.setScalar(FIG_H);
  const parts = [body];
  g.add(body);
  if (a.demoMe || a.isPlayer) { // toi : plus grand, flèche dorée qui rebondit au-dessus de la tête
    g.scale.setScalar(1.35);
    const arrowM = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xffa800, emissiveIntensity: 0.9 }));
    arrowM.position.y = 0.55; arrowM.userData.bob = true; g.add(arrowM);
  }
  if (a.demoMe || a.isPlayer) { // anneau doré au sol
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    ring.position.y = 0.01; g.add(ring);
  }
  g.userData.actorId = a.id;
  scene.add(g);
  return { g, body, parts, last: { x: a.px, y: a.py }, phase: rnd() * 6, lane: 0, vehKey: null, veh: null };
}
// Véhicules des habitants (construits vers +z, l'avant de la personne)
const vehGeoCache = new Map();
function vehicleGeo(kind, col) {
  const key = `${kind}:${col}`;
  if (vehGeoCache.has(key)) return vehGeoCache.get(key);
  let g;
  if (kind === 'velo') g = bikeGeo(null, 'z');
  else if (kind === 'trottinette') {
    g = mergeGeometries([
      paint(box(0.05, 0.015, 0.22, 0, 0.03, 0), 0x2a2a30),
      paint(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10).rotateZ(Math.PI / 2).translate(0, 0.025, 0.1), 0x111111),
      paint(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10).rotateZ(Math.PI / 2).translate(0, 0.025, -0.1), 0x111111),
      paint(box(0.015, 0.2, 0.015, 0, 0.03, 0.1), col),
      paint(box(0.1, 0.015, 0.015, 0, 0.23, 0.1), 0x2a2a30),
    ]);
  } else if (kind === 'scooter') {
    g = mergeGeometries([
      paint(box(0.1, 0.07, 0.3, 0, 0.05, 0), col),
      paint(box(0.09, 0.05, 0.12, 0, 0.12, -0.05), 0x2a2a30),
      paint(box(0.08, 0.16, 0.04, 0, 0.05, 0.13), col),
      paint(box(0.14, 0.015, 0.015, 0, 0.22, 0.13), 0x2a2a30),
      paint(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateZ(Math.PI / 2).translate(0, 0.04, 0.14), 0x111111),
      paint(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateZ(Math.PI / 2).translate(0, 0.04, -0.13), 0x111111),
    ]);
  } else g = carGeo(col).rotateY(-Math.PI / 2);
  vehGeoCache.set(key, g);
  return g;
}
function setVehicle(v, kind, a) {
  if (v.veh) { v.g.remove(v.veh); v.veh = null; }
  v.vehKey = kind;
  const car = kind === 'voiture';
  for (const p of v.parts) { p.visible = !car; p.position.y = kind && !car ? 0.045 : 0; } // à vélo : assis sur la selle
  if (!kind) return;
  const col = CAR_COLORS[[...String(a.id)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % CAR_COLORS.length];
  v.veh = new THREE.Mesh(vehicleGeo(kind, col), mats.solid);
  v.veh.scale.setScalar(1 / v.g.scale.x); // (le joueur est dessiné un peu plus grand : pas son véhicule)
  v.g.add(v.veh);
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
// Cycliste (vélo + personne), construit dans l'axe x comme les voitures
function bikeGeo(shirt, along = 'x') {
  const parts = [];
  for (const o of [-0.1, 0.1]) parts.push(paint(new THREE.TorusGeometry(0.055, 0.012, 5, 12).translate(o, 0.06, 0), 0x222228));
  parts.push(paint(box(0.2, 0.018, 0.018, 0, 0.1, 0), 0x3d6fd8));
  parts.push(paint(box(0.018, 0.08, 0.018, -0.04, 0.1, 0), 0x3d6fd8));
  parts.push(paint(box(0.018, 0.03, 0.12, 0.09, 0.16, 0), 0x2a2a30));
  if (shirt != null) {
    parts.push(paint(box(0.07, 0.16, 0.09, -0.03, 0.17, 0), shirt));
    parts.push(paint(new THREE.SphereGeometry(0.045, 8, 6).translate(-0.01, 0.38, 0), 0xf1c7a3));
    parts.push(paint(new THREE.SphereGeometry(0.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.01, 0.39, 0), 0xf2c94c)); // casque
  }
  const g = mergeGeometries(parts);
  if (along === 'z') g.rotateY(-Math.PI / 2);
  return g;
}
const riderGeos = [0xd8504d, 0x4bbf8b, 0xf2c94c, 0x9b6ee8].map(c => bikeGeo(c));
const cars = [];
function pickNext(c) {
  const [dx, dy] = c.dir;
  const opts = [[dx, dy], [-dy, dx], [dy, -dx]].filter(([ax, ay]) => roadAt(c.x + ax, c.y + ay));
  if (!opts.length) return null;
  const st = opts.find(([ax, ay]) => ax === dx && ay === dy);
  const d = st && (opts.length === 1 || rnd() < 0.65) ? st : opts[Math.floor(rnd() * opts.length)];
  return { x: c.x + d[0], y: c.y + d[1], dir: d };
}
// Voitures sur leur voie (à droite), vélos sur la piste cyclable, plus lents
const LANE = { car: 0.24, bike: 0.5 + RW - 0.115 };
function spawnCar(kind = 'car') {
  const gt = gates[Math.floor(rnd() * gates.length)];
  const geo = kind === 'bike' ? riderGeos[Math.floor(rnd() * riderGeos.length)] : carGeos[Math.floor(rnd() * carGeos.length)];
  const mesh = new THREE.Mesh(geo, mats.solid);
  scene.add(mesh);
  const c = { kind, mesh, x: gt.x, y: gt.y, dir: gt.dir, t: 0, speed: kind === 'bike' ? 0.9 + rnd() * 0.4 : 2.0 + rnd(), alive: true };
  c.next = pickNext(c);
  cars.push(c);
}
for (let i = 0; i < 10; i++) { spawnCar(); const c = cars[cars.length - 1]; for (let k = Math.floor(rnd() * 14); k > 0 && c.next; k--) { c.x = c.next.x; c.y = c.next.y; c.dir = c.next.dir; c.next = pickNext(c); } }
function updateCars(dt) {
  for (const c of cars) {
    if (!c.next) { c.alive = false; continue; }
    const axis = c.next.dir[0] !== 0 ? 'x' : 'y';
    // Feu rouge : on s'arrête AVANT le passage piéton (pas dessus) ; déjà engagé sur le passage, on dégage le carrefour
    const curT = T(c.x, c.y), cr = T(c.next.x, c.next.y) && T(c.next.x, c.next.y).crossing;
    const redCross = cr && !curT.crossing && !jset.has(`${c.x},${c.y}`)
      && Math.abs(cr.jx - c.next.x) + Math.abs(cr.jy - c.next.y) < Math.abs(cr.jx - c.x) + Math.abs(cr.jy - c.y)
      && !carMayGo(world, cr.jx, cr.jy, cr.axis);
    const red = redCross || (jset.has(`${c.next.x},${c.next.y}`) && !jset.has(`${c.x},${c.y}`) && !curT.crossing && !carMayGo(world, c.next.x, c.next.y, axis));
    const ahead = cars.some(o => o !== c && o.alive && o.kind === c.kind && o.dir[0] === c.dir[0] && o.dir[1] === c.dir[1] && (() => {
      const ax = ((o.x + o.dir[0] * o.t) - (c.x + c.dir[0] * c.t)) * c.dir[0] + ((o.y + o.dir[1] * o.t) - (c.y + c.dir[1] * c.t)) * c.dir[1];
      const side = Math.abs((o.x - c.x) * c.dir[1] - (o.y - c.y) * c.dir[0]);
      return ax > 0 && ax < 0.9 && side < 0.3;
    })());
    if (red && c.t <= 0.42) c.t = Math.min(0.4, c.t + c.speed * dt);
    else if (!ahead) c.t += c.speed * dt;
    while (c.t >= 1 && c.next) { c.t -= 1; c.x = c.next.x; c.y = c.next.y; c.dir = c.next.dir; c.next = pickNext(c); }
    const lane = LANE[c.kind] || LANE.car;
    // dans les virages, on glisse doucement d'une voie à l'autre (au lieu de couper en diagonale)
    // (le tronçon en cours va de la case actuelle vers c.next, dans la direction c.next.dir)
    const nd = c.next ? c.next.dir : c.dir;
    const k = nd[0] !== c.dir[0] || nd[1] !== c.dir[1] ? Math.min(1, c.t * 2) : 1;
    const ox = -(c.dir[1] * (1 - k) + nd[1] * k) * lane, oz = (c.dir[0] * (1 - k) + nd[0] * k) * lane;
    const px = c.x + nd[0] * c.t + ox, pz = c.y + nd[1] * c.t + oz;
    c.mesh.position.set(px, 0.005, pz);
    c.mesh.rotation.y = Math.atan2(-(c.dir[1] * (1 - k) + nd[1] * k), c.dir[0] * (1 - k) + nd[0] * k);
  }
  for (const c of cars) if (!c.alive) scene.remove(c.mesh);
  for (let i = cars.length - 1; i >= 0; i--) if (!cars[i].alive) cars.splice(i, 1);
  const day = world.hour > 6 && world.hour < 22;
  const nCar = cars.filter(c => c.kind === 'car').length, nBike = cars.length - nCar;
  if (nCar < Math.round((mobile ? 8 : 14) * (day ? 1 : 0.35)) && rnd() < dt * 1.5) spawnCar('car');
  if (world.weather !== 'rain' && world.weather !== 'snow' && nBike < (day ? 6 : 1) && rnd() < dt) spawnCar('bike');
}

// ---------- Véhicules de secours : pompiers, ambulance, police (partent de leur caserne / hôpital / commissariat) ----------
// Ils roulent vite par la chaussée, gyrophares allumés, sans s'arrêter aux feux ; ils restent sur place pendant
// l'intervention puis rentrent à la base.
const SIREN = { r: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2.5 }),
  b: new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x2a6bff, emissiveIntensity: 2.5 }), off: new THREE.MeshStandardMaterial({ color: 0x444a55 }) };
function serviceGeo(kind) {
  const P = [];
  const wheels = (len, w) => { for (const dx of [len * 0.32, -len * 0.32]) for (const dz of [w / 2, -w / 2]) P.push(paint(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 10).rotateX(Math.PI / 2).translate(dx, 0.065, dz), 0x1c1c22)); };
  if (kind === 'fire') { // grand camion rouge, échelle sur le toit
    P.push(paint(box(0.95, 0.3, 0.36, -0.05, 0.06, 0), 0xc0261d));
    P.push(paint(box(0.26, 0.24, 0.36, 0.38, 0.06, 0), 0xc0261d));
    P.push(paint(box(0.2, 0.12, 0.37, 0.4, 0.17, 0), 0x2a3a50));               // pare-brise
    P.push(paint(box(0.95, 0.03, 0.37, -0.05, 0.2, 0), 0xf2f2f2));             // bande blanche
    P.push(paint(box(0.8, 0.03, 0.1, -0.1, 0.38, 0), 0xd5dde2));               // échelle
    for (let k = 0; k < 6; k++) P.push(paint(box(0.015, 0.03, 0.14, -0.45 + k * 0.14, 0.4, 0), 0x9aa0aa));
    wheels(0.95, 0.34);
  } else if (kind === 'ambulance') { // fourgon blanc à bandes rouges, croix
    P.push(paint(box(0.7, 0.32, 0.32, -0.04, 0.06, 0), 0xf7f8fa));
    P.push(paint(box(0.18, 0.2, 0.32, 0.36, 0.06, 0), 0xf7f8fa));
    P.push(paint(box(0.12, 0.1, 0.33, 0.38, 0.15, 0), 0x2a3a50));
    P.push(paint(box(0.86, 0.05, 0.33, 0.02, 0.17, 0), 0xe2475b));
    P.push(paint(box(0.16, 0.05, 0.005, -0.08, 0.28, 0.163), 0xe2475b), paint(box(0.05, 0.16, 0.005, -0.08, 0.225, 0.163), 0xe2475b));
    P.push(paint(box(0.16, 0.05, 0.005, -0.08, 0.28, -0.163), 0xe2475b), paint(box(0.05, 0.16, 0.005, -0.08, 0.225, -0.163), 0xe2475b));
    wheels(0.7, 0.3);
  } else { // voiture de police blanche et bleue
    P.push(paint(box(0.64, 0.14, 0.3, 0, 0.06, 0), 0xf2f4f8));
    P.push(paint(box(0.64, 0.05, 0.31, 0, 0.1, 0), 0x2b4ea2));
    P.push(paint(box(0.34, 0.12, 0.26, -0.03, 0.2, 0), 0xf2f4f8));
    P.push(paint(box(0.3, 0.09, 0.27, -0.03, 0.21, 0), 0x2a3a50));
    wheels(0.62, 0.3);
  }
  return mergeGeometries(P);
}
const SERVICE_GEOS = { fire: serviceGeo('fire'), ambulance: serviceGeo('ambulance'), police: serviceGeo('police') };
const SERVICE_HOME = { fire: 'firestation', ambulance: 'hospital', police: 'police' };
const SIREN_Y = { fire: 0.39, ambulance: 0.4, police: 0.33 };
const emergencies = [];
// Case de chaussée la plus proche d'un point (par les cases praticables)
function nearestRoad(x, y) {
  const seen = new Set([`${x},${y}`]), q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.shift();
    if (roadAt(cx, cy)) return { x: cx, y: cy };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !T(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return null;
}
// Itinéraire par la chaussée seulement (parcours en largeur)
function roadRoute(a, b) {
  const key = (x, y) => y * W + x, prev = new Map([[key(a.x, a.y), -1]]), q = [a];
  while (q.length) {
    const c = q.shift();
    if (c.x === b.x && c.y === b.y) {
      const out = []; for (let k = key(c.x, c.y); k !== -1; k = prev.get(k)) out.unshift({ x: k % W, y: Math.floor(k / W) });
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = key(nx, ny);
      if (!roadAt(nx, ny) || prev.has(k)) continue;
      prev.set(k, key(c.x, c.y)); q.push({ x: nx, y: ny });
    }
  }
  return null;
}
function dispatch(kind, tx, ty, key, minutes = null) {
  const old = emergencies.find(e => e.key === key && e.state !== 'back');
  if (old) { if (minutes) old.until = world.minutes + minutes; return; }
  if (kind === 'police' && emergencies.filter(e => e.kind === 'police').length >= 3) return;
  const base = map.buildings.find(b => b.type === SERVICE_HOME[kind]);
  if (!base) return;
  const from = nearestRoad(base.entrances[0].x, base.entrances[0].y), to = nearestRoad(Math.round(tx), Math.round(ty));
  if (!from || !to) return;
  const route = roadRoute(from, to);
  if (!route) return;
  // déjà un véhicule garé là : on se gare une place avant (pas l'un dans l'autre)
  for (let n = emergencies.filter(e => e.state !== 'back' && e.to.x === to.x && e.to.y === to.y).length; n > 0 && route.length > 2; n--) route.pop();
  const mesh = new THREE.Mesh(SERVICE_GEOS[kind], mats.solid);
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.08), SIREN.r), l2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.08), SIREN.b);
  l1.position.set(kind === 'fire' ? 0.42 : -0.03, SIREN_Y[kind], 0.06); l2.position.set(kind === 'fire' ? 0.42 : -0.03, SIREN_Y[kind], -0.06);
  mesh.add(l1, l2); mesh.userData.noTap = true;
  mesh.position.set(route[0].x, 0.005, route[0].y);
  scene.add(mesh);
  emergencies.push({ kind, key, mesh, l1, l2, route, i: 0, t: 0, state: 'go', until: minutes ? world.minutes + minutes : null, from, to });
}
function recall(key) { for (const e of emergencies) if (e.key === key && e.state !== 'back') e.until = world.minutes; }
function updateEmergencies(dt, rate) {
  const now = performance.now();
  api.emergencies = emergencies; // (débogage : state.city3d.emergencies)
  for (const e of emergencies) {
    const on = Math.floor(now / 450) % 2 === 0; // gyrophares : alternance douce (pas de stroboscope)
    e.l1.material = on ? SIREN.r : SIREN.off; e.l2.material = on ? SIREN.off : SIREN.b;
    if (e.state === 'stay') {
      if (e.until != null && world.minutes >= e.until) { // fin de l'intervention : retour à la base
        const back = roadRoute(e.route[e.route.length - 1], e.from);
        if (!back) { e.done = true; continue; }
        e.route = back; e.i = 0; e.t = 0; e.state = 'back';
      }
      continue;
    }
    if (rate <= 0) continue;
    e.t += dt * 3.2;
    while (e.t >= 1 && e.i < e.route.length - 1) { e.t -= 1; e.i++; }
    if (e.i >= e.route.length - 1) {
      if (e.state === 'go') { e.state = 'stay'; e.t = 0; } else { e.done = true; continue; }
    }
    const a = e.route[Math.min(e.i, e.route.length - 1)], b = e.route[Math.min(e.i + 1, e.route.length - 1)];
    const dx = b.x - a.x, dy = b.y - a.y, tt = e.state === 'stay' ? 0 : Math.min(1, e.t);
    if (dx || dy) {
      e.mesh.position.set(a.x + dx * tt - dy * LANE.car, 0.005, a.y + dy * tt + dx * LANE.car);
      e.mesh.rotation.y = Math.atan2(-dy, dx);
    }
  }
  for (const e of emergencies) if (e.done) scene.remove(e.mesh);
  for (let i = emergencies.length - 1; i >= 0; i--) if (emergencies[i].done) emergencies.splice(i, 1);
}
// Interventions : délit vu par la police, garde à vue (incendies : voir showFire / hideFire)
if (!opts.demo) {
  world.on('crime', e => { if (e.outcome === 'seen' || e.outcome === 'caught') dispatch('police', e.actor.px, e.actor.py, `crime:${e.actor.id}`, 30); });
  world.on('custody', e => dispatch('police', e.actor.px, e.actor.py, `custody:${e.actor.id}`, 20));
  world.on('arrested', e => dispatch('police', e.actor.px, e.actor.py, `arrest:${e.actor.id}`, 20));
}

// ---------- Jour / nuit ----------
const tmpC = new THREE.Color();
const SKY_ZENITH_DAY = new THREE.Color(0x6fa8e0), SKY_ZENITH_NIGHT = new THREE.Color(0x070b1c);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x6fa8e0) }, bottom: { value: new THREE.Color(0xbcd6ee) } },
  vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 12), skyMat);
sky.userData.noTap = true; sky.renderOrder = -1; scene.add(sky);
// Halo lumineux la nuit (fenêtres, lampadaires, feux) : seulement sur les appareils puissants
let composer = null, bloom = null;
if (!mobile && !opts.saver) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0, 0.3, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function lighting() {
  const h = world.hour;
  const day = THREE.MathUtils.clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1); // 0 la nuit, 1 à midi
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(h - 19.5) / 1.6, 0, 1) + THREE.MathUtils.clamp(1 - Math.abs(h - 6.5) / 1.2, 0, 1);
  const night = THREE.MathUtils.clamp(1 - day * 3, 0, 1);
  // le soleil avance par pas de 10 min de jeu : les ombres sont recalculées à ce moment-là seulement (pas de scintillement)
  const hq = Math.round(h * 6) / 6;
  if (hq !== lastSunH) { lastSunH = hq; renderer.shadowMap.needsUpdate = true; }
  const ang = ((hq - 6) / 12) * Math.PI;
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
  skyMat.uniforms.top.value.copy(tmpC).lerp(SKY_ZENITH_NIGHT, night).lerp(SKY_ZENITH_DAY, day * 0.7);
  skyMat.uniforms.bottom.value.copy(tmpC);
  sky.position.copy(camera.position);
  // halo des lumières la nuit
  if (bloom) bloom.strength = night * 0.38;
  const glow = night * 1.6;
  mats.wall.emissiveIntensity = glow; for (const m of Object.values(STYLE_MATS)) m.emissiveIntensity = glow; for (const m of HOUSE_MATS) m.emissiveIntensity = glow * 0.9; mats.shop.emissiveIntensity = glow * 1.1; mats.glass.emissiveIntensity = glow * 0.3;
  mats.bulb.emissiveIntensity = night * 3;
  renderer.toneMappingExposure = 0.95;
}
let forceNight = false;
let lastSunH = null;
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
  school: '#d9962b', court: '#4a5266', bank: '#1f7a52', gym: '#f08a3c',
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
// Suivi du joueur : la caméra reste accrochée à ton personnage. Pendant le suivi, un doigt (ou clic gauche)
// fait tourner la vue AUTOUR de toi et deux doigts zooment ; déplacer la vue (deux doigts, clic droit) arrête le suivi
// (🎯 pour le reprendre). Sans suivi : un doigt déplace la carte, deux doigts zooment et tournent.
let userDrag = null;
function setFollow(v) {
  api.follow = v;
  if (opts.demo) return;
  const rot1 = settings().oneFinger !== 'pan'; // réglage : un doigt tourne autour de toi, ou déplace la vue
  // un doigt : tourner la vue (gauche-droite et haut-bas) ; deux doigts : zoomer (pincer) et se déplacer
  controls.touches = rot1 ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = v ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  const b = document.getElementById('b-center'); if (b) b.classList.toggle('on', v);
}
setFollow(true);
onSettings(() => { applyCamSettings(); setFollow(api.follow); });
controls.addEventListener('start', () => { userDrag = controls.target.clone(); });
controls.addEventListener('end', () => { userDrag = null; });
controls.addEventListener('change', () => {
  const me = opts.player;
  if (userDrag && api.follow && me && me.outdoors && !interiorOn && Math.hypot(controls.target.x - me.px, controls.target.z - me.py) > 1.2) setFollow(false);
});
api.setFollow = setFollow;
api.centerOnPlayer = () => { const p = opts.player; if (p) { setFollow(true); centerOn(p.px, p.py); } };
// Pivoter la vue de 45° (boutons ⟲ ⟳), en douceur autour du point regardé
let rotLeft = 0;
api.rotateBy = a => { rotLeft += a; };
function applyRotation(dt) {
  if (Math.abs(rotLeft) < 1e-4) return;
  const step = Math.sign(rotLeft) * Math.min(Math.abs(rotLeft), dt * 3.2);
  rotLeft -= step;
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
  camera.position.copy(controls.target).add(off);
  dirty = true;
}
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
  const s = p.inside != null ? { x: innerWidth / 2, y: innerHeight * 0.32 } : project(new THREE.Vector3(p.px, 0.6, p.py)); // dedans : au centre
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
    el.innerHTML = `<i class="ic"></i><b class="st"></b><s class="job">${PIN_GLYPHS.work}</s><em class="tag"></em>`;
    el.onclick = e => { e.stopPropagation(); opts.onPlace && opts.onPlace(b); };
    pinsEl.appendChild(el);
    const cx = b.tiles.reduce((s, t) => s + t.x, 0) / b.tiles.length, cz = b.tiles.reduce((s, t) => s + t.y, 0) / b.tiles.length;
    pins.push({ b, el, pos: new THREE.Vector3(cx, (tops[b.id] || 2) + 0.35, cz), show: true, state: '' });
  }
  // Toucher : un habitant, un lieu (façade ou toit), ou le sol pour y aller
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), held = performance.now() - down.t; down = null;
    if (moved < (mobile ? 18 : 8) && held < 450) tap(e.clientX, e.clientY);
  });
  function tap(cx, cy) {
    if (interior && opts.player && opts.player.inside != null) return interior.tap(cx, cy, camera);
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
      if (t.walk && !t.deco) { setFollow(true); ping(tx, ty); }
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
  // les pompiers arrivent de la caserne, une ambulance se tient prête
  const t0 = b.entrances[0] || b.tiles[0];
  dispatch('fire', t0.x, t0.y, `fire:${b.id}`);
  dispatch('ambulance', t0.x, t0.y, `amb:${b.id}`);
};
api.hideFire = b => {
  const g = fires[b.id]; if (g) { scene.remove(g); delete fires[b.id]; }
  recall(`fire:${b.id}`); recall(`amb:${b.id}`); // feu éteint : retour à la base (l'ambulance repart aussi)
};
function ping(x, z) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  m.position.set(x, 0.12, z); m.userData.noTap = true; scene.add(m);
  const t0 = performance.now();
  const tick = () => { const k = (performance.now() - t0) / 700; if (k >= 1) { scene.remove(m); return; } m.scale.setScalar(1 + k * 1.2); m.material.opacity = 0.9 * (1 - k); requestAnimationFrame(tick); };
  tick();
}
// Trajet du joueur : pointillés dorés au sol jusqu'à la destination, repère qui reste jusqu'à l'arrivée
const ROUTE_MAX = 400;
const routeDots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.055, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false }), ROUTE_MAX);
routeDots.count = 0; routeDots.userData.noTap = true; routeDots.frustumCulled = false; routeDots.renderOrder = 3;
scene.add(routeDots);
const routeDest = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.y = 0.11; routeDest.add(ring);
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 10).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xff9a00, emissiveIntensity: 0.6 }));
  pin.position.y = 0.45; pin.userData.bob = true; routeDest.add(pin);
}
routeDest.visible = false; routeDest.userData.noTap = true; scene.add(routeDest);
let routeT = 0;
function updateRoute() {
  const p = opts.player;
  const show = p && p.outdoors && p.path && p.path.length > 0;
  routeDest.visible = !!show;
  if (!show) { routeDots.count = 0; return; }
  const last = p.path[p.path.length - 1];
  routeDest.position.set(last.x, 0, last.y);
  routeDest.children[1].position.y = 0.45 + Math.sin(performance.now() / 220) * 0.05;
  routeDest.children[0].scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.08);
  if ((routeT -= 1 / 60) > 0) return;
  routeT = 0.15;
  let n = 0, px = p.px, py = p.py, carry = 0.2;
  for (const t of p.path) {
    const dx = t.x - px, dy = t.y - py, d = Math.hypot(dx, dy);
    let s = carry;
    for (; s < d && n < ROUTE_MAX; s += 0.32) { m4.makeTranslation(px + dx * s / d, 0.115, py + dy * s / d); routeDots.setMatrixAt(n++, m4); }
    carry = Math.max(0, s - d);
    px = t.x; py = t.y;
  }
  routeDots.count = n; routeDots.instanceMatrix.needsUpdate = true;
}
const marks = { home: null, work: null };
function footprintRing(b, color) {
  const xs = b.tiles.map(t => t.x), zs = b.tiles.map(t => t.y);
  const x0 = Math.min(...xs) - 0.62, x1 = Math.max(...xs) + 0.62, z0 = Math.min(...zs) - 0.62, z1 = Math.max(...zs) + 0.62;
  const sh = new THREE.Shape([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]);
  const hole = new THREE.Path([new THREE.Vector2(x0 + 0.12, z0 + 0.12), new THREE.Vector2(x1 - 0.12, z0 + 0.12), new THREE.Vector2(x1 - 0.12, z1 - 0.12), new THREE.Vector2(x0 + 0.12, z1 - 0.12)]);
  sh.holes.push(hole);
  const geo = new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2).translate(0, 0.12, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.noTap = true; m.userData.bid = b.id; m.renderOrder = 2;
  scene.add(m);
  return m;
}
function updateMarks() {
  const p = opts.player;
  if (!p) return;
  const want = { home: p.home != null ? p.home : null, work: p.job && !p.job.street ? p.job.building : null };
  for (const k of ['home', 'work']) {
    if (marks[k] && marks[k].userData.bid === want[k]) continue;
    if (marks[k]) { scene.remove(marks[k]); marks[k].geometry.dispose(); marks[k] = null; }
    if (want[k] != null) marks[k] = footprintRing(world.building(want[k]), k === 'home' ? 0xffc21a : 0x3d84ff);
  }
  const k = 0.62 + Math.sin(performance.now() / 900) * 0.12; // liseré qui respire doucement (pas de clignotement)
  for (const m of Object.values(marks)) if (m) m.material.opacity = k;
}
let pinTick = 0, lastPinSig = '';
function updateGame(dt) {
  if (opts.demo) return;
  const now = performance.now() / 1000;
  for (const m of extraMeshes) if (m.userData.blink) m.material.emissiveIntensity = Math.sin(now * 8) > 0 ? 3 : 0.3;
  for (const g of Object.values(fires)) for (const c of g.children) { const k = 0.8 + Math.sin(now * 9 + c.userData.phase) * 0.25; c.scale.set(1, k, 1); }
  // la caméra suit ton personnage quand il se déplace (sauf si tu as bougé la vue toi-même)
  const me = opts.player;
  if (api.follow && me && me.outdoors && !userDrag && Math.hypot(controls.target.x - me.px, controls.target.z - me.py) > 0.03) camGoal.t = new THREE.Vector3(me.px, 0, me.py);
  applyRotation(dt);
  updateRoute();
  // la caméra glisse vers sa cible
  if (camGoal.t) {
    const d = camGoal.t.clone().sub(controls.target);
    if (d.length() < 0.02) camGoal.t = null;
    else { d.multiplyScalar(Math.min(1, dt * 5)); controls.target.add(d); camera.position.add(d); }
  }
  updateMarks();
  // épingles : état (icône, couleur, ouvert / fermé, poste libre) une fois par seconde, position à chaque image
  pinTick -= dt;
  const p = opts.player;
  if (pinTick <= 0) {
    pinTick = 1;
    for (const pin of pins) {
      const b = pin.b;
      // pictogramme vectoriel de la couleur du lieu ; chez toi (or) et ton travail (bleu) : plus grands, avec une étiquette
      let icon = b.type, color = PIN_COLORS[b.type] || '#7a6f96', show = true, open = null, job = false, role = '';
      if (b.type === 'home') {
        const mine = p && b.id === p.home;
        show = mine || freeUnits(world, b) > 0;
        icon = mine ? 'home' : 'key';
        if (mine) { color = '#f0a500'; role = 'home'; }
      } else {
        const closed = isClosed(world, b.id);
        if (closed) { icon = 'lock'; color = '#8a8f99'; }
        if (p && p.job && p.job.building === b.id) { color = '#2f6fe0'; role = 'work'; }
        const staffed = b.jobs && b.type !== 'office' && !['police', 'firestation', 'prison'].includes(b.type);
        open = closed ? false : staffed ? !!sellerAt(world, b) : null;
        job = !closed && !role && openings(world, b) > 0;
      }
      pin.show = show;
      pin.role = role;
      const st = `${icon}|${color}|${open}|${job}|${role}`;
      if (st !== pin.state) {
        pin.state = st;
        pin.el.querySelector('.ic').innerHTML = PIN_GLYPHS[icon] || PIN_GLYPHS.office;
        pin.el.classList.toggle('pin-home', role === 'home');
        pin.el.classList.toggle('pin-work', role === 'work');
        pin.el.querySelector('.tag').textContent = role === 'home' ? tr('Chez toi') : role === 'work' ? tr('Ton travail') : '';
        pin.el.style.setProperty('--pc', color);
        const s = pin.el.querySelector('.st');
        s.style.display = open == null ? 'none' : ''; s.style.background = open ? '#34c759' : '#e2475b';
        pin.el.querySelector('.job').style.display = job ? '' : 'none';
      }
    }
  }
  // positions + pas de chevauchement (priorité : chez toi / ton travail, puis services et commerces, puis logements libres)
  // (seulement quand la caméra a bougé ou que les épingles ont changé : moins de travail pour le téléphone)
  const camSig = `${camera.position.x.toFixed(3)},${camera.position.y.toFixed(3)},${camera.position.z.toFixed(3)},${controls.target.x.toFixed(3)},${controls.target.z.toFixed(3)},${innerWidth},${pinTick === 1 ? Math.random() : ''}`;
  if (camSig !== lastPinSig) {
    lastPinSig = camSig;
    const prio = b => (p && (b.id === p.home || (p.job && p.job.building === b.id)) ? 3 : b.type === 'home' ? 1 : 2);
    const placed = [];
    const list = pins.map(pin => ({ pin, s: project(pin.pos) })).sort((a, b) => prio(b.pin.b) - prio(a.pin.b));
    for (const { pin, s } of list) {
      let ok = pin.show && s.front && s.x > -40 && s.x < innerWidth + 40 && s.y > -40 && s.y < innerHeight + 40;
      if (ok && !pin.role) ok = !placed.some(q => Math.abs(q.x - s.x) < 34 && Math.abs(q.y - s.y) < 40);
      if (pin.vis !== ok) { pin.vis = ok; pin.el.style.display = ok ? '' : 'none'; }
      if (ok) {
        placed.push(s);
        const tf = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
        if (pin.tf !== tf) { pin.tf = tf; pin.el.style.transform = tf; }
      }
    }
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
// Une douzaine de passants types (apparences partagées : peu de géométries en mémoire)
const WALKER_LOOKS = Array.from({ length: 12 }, (_, i) => ({
  skin: [0xf6d7c3, 0xf1c7a3, 0xd9a77e, 0xb57a52, 0x8a5634, 0x5e3a24][i % 6],
  body: [0xf2c94c, 0xe86a8c, 0x5b8def, 0x4bbf8b, 0x9b6ee8, 0xf08a3c, 0x3cb5c9, 0xffffff, 0x333a4a, 0xd8504d, 0x7fb3d5, 0xc9a227][i],
  legs: [0x3a4766, 0x2a2f3d, 0x6b4a2f, 0x8a8f99, 0x2e6b4a][i % 5],
  hairColor: [0x1c1410, 0x4a3020, 0x7a4a2a, 0xb5651d, 0xd9a441, 0xdddddd][(i * 5) % 6],
  hairStyle: ['court', 'long', 'boucles', 'queue', 'chignon', 'carre', 'afro', 'court', 'casquette', 'tresses', 'chauve', 'long'][i],
  build: ['normal', 'mince', 'normal', 'fort'][i % 4],
  outfit: [null, 'robe', null, 'sweat', 'veste', null, 'mariniere', 'costume', null, 'robe', null, 'sweat'][i],
}));
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
const MAX_WALKERS = [3, 5, 14][quality];
function spawnWalker() {
  if (!footGates.length) return;
  const g = pickC(footGates), to = pickC(footGates);
  const via = Math.random() < 0.6 ? (Math.random() < 0.5 && mainWalk.length ? pickC(mainWalk) : map.randomFootpath()) : null;
  const leg1 = findPath(map, g, (x, y) => (via ? x === via.x && y === via.y : x === to.x && y === to.y));
  if (!leg1) return;
  let path = leg1.path;
  if (via) { const leg2 = findPath(map, via, (x, y) => x === to.x && y === to.y); if (!leg2) return; path = path.concat(leg2.path); }
  if (path.length < 6) return;
  const look = pickC(WALKER_LOOKS);
  const mesh = new THREE.Mesh(figurePose(look), FIGURE_MAT);
  mesh.scale.setScalar(FIG_H); mesh.userData.noTap = true;
  mesh.position.set(g.x, 0.08, g.y); scene.add(mesh);
  walkers.push({ mesh, look, x: g.x, y: g.y, path, speed: 1.0 + Math.random() * 0.4, ph: Math.random() * 6 });
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
    p.ph += dt * (moving ? 10 : 0);
    const geo = figurePose(p.look, moving ? 'walk' : 'stand', Math.floor(p.ph / (Math.PI * 2 / WALK_FRAMES)));
    if (p.mesh.geometry !== geo) p.mesh.geometry = geo;
    p.mesh.position.set(p.x, 0.08 + (moving ? Math.abs(Math.sin(p.ph)) * 0.008 : 0), p.y);
  }
  for (let i = walkers.length - 1; i >= 0; i--) if (!walkers[i].path.length) { scene.remove(walkers[i].mesh); walkers.splice(i, 1); } // (géométries partagées : pas de dispose)
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

const WN = [250, 600, 1000][quality];
const wPos = new Float32Array(WN * 3);
for (let i = 0; i < WN; i++) { wPos[i * 3] = (Math.random() - 0.5) * 26; wPos[i * 3 + 1] = Math.random() * 10; wPos[i * 3 + 2] = (Math.random() - 0.5) * 26; }
const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
const wMat = new THREE.PointsMaterial({ color: 0xb8d4f0, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false });
const weatherPts = new THREE.Points(wGeo, wMat);
weatherPts.frustumCulled = false; weatherPts.userData.noTap = true; weatherPts.visible = false; scene.add(weatherPts);
function updateWeather(dt) {
  const kind = world.weather;
  weatherPts.visible = kind === 'rain' || kind === 'snow';
  if (!weatherPts.visible) return;
  const snow = kind === 'snow';
  wMat.color.set(snow ? 0xffffff : 0xb8d4f0); wMat.size = snow ? 0.11 : 0.06;
  weatherPts.position.set(controls.target.x, 0, controls.target.z);
  const t = performance.now() / 1000;
  for (let i = 0; i < WN; i++) {
    let y = wPos[i * 3 + 1] - dt * (snow ? 1.1 : 11);
    if (snow) wPos[i * 3] += Math.sin(t + i) * dt * 0.3;
    if (y < 0) { y = 10; wPos[i * 3] = (Math.random() - 0.5) * 26; wPos[i * 3 + 2] = (Math.random() - 0.5) * 26; }
    wPos[i * 3 + 1] = y;
  }
  wGeo.attributes.position.needsUpdate = true;
}
let aliveTick = 0;
// Canards sur l'étang du parc : ils tournent doucement
const ducks = [];
{
  const pt = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T(x, y).ground === 'pond') pt.push({ x, y });
  if (pt.length) {
    const cx = pt.reduce((s, p) => s + p.x, 0) / pt.length, cz = pt.reduce((s, p) => s + p.y, 0) / pt.length;
    const rx = (Math.max(...pt.map(p => p.x)) - Math.min(...pt.map(p => p.x))) / 2, rz = (Math.max(...pt.map(p => p.y)) - Math.min(...pt.map(p => p.y))) / 2;
    for (let i = 0; i < 4; i++) {
      const geos = [
        paint(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.7, 1.4), i === 0 ? 0xf4f1ea : 0x8a6a4a),
        paint(new THREE.SphereGeometry(0.04, 8, 6).translate(0, 0.07, 0.08), i === 0 ? 0xf4f1ea : 0x2f7d4a),
        paint(new THREE.ConeGeometry(0.018, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0.065, 0.13), 0xf2a33a),
      ];
      const g = new THREE.Mesh(mergeGeometries(geos), mats.solid);
      g.userData.noTap = true; scene.add(g);
      ducks.push({ g, a: i * 1.6, k: 0.4 + i * 0.17, cx, cz, rx: Math.max(0.3, rx * (0.4 + i * 0.15)), rz: Math.max(0.2, rz * (0.3 + i * 0.15)) });
    }
  }
}
function updateDucks(dt) {
  for (const d of ducks) {
    d.a += dt * 0.18 * d.k;
    d.g.position.set(d.cx + Math.cos(d.a) * d.rx, 0.07 + Math.sin(d.a * 6) * 0.004, d.cz + Math.sin(d.a) * d.rz);
    d.g.rotation.y = Math.atan2(-Math.sin(d.a) * d.rx, Math.cos(d.a) * d.rz);
  }
}

// Feu d'artifice du Nouvel An au-dessus de la Seine (dernier soir de l'année à partir de 23h30 jusqu'à 0h40)
const FW_COLORS = [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x9b6ee8, 0x6cff9a, 0xffffff, 0xff9a3c];
const bursts = [];
// étincelle ronde et douce (sinon les points sont des carrés)
const sparkTex = canvasTex(32, (g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.clearRect(0, 0, S, S); g.fillStyle = gr; g.fillRect(0, 0, S, S);
}, false);
let fwNext = 0, fwForce = 0;
api.fireworks = (sec = 20) => { fwForce = sec; }; // (pour tester : state.city3d.fireworks())
function fireworksOn() {
  if (fwForce > 0) return true;
  const doy = world.dayOfYear, h = world.hour;
  return (doy === 56 && h >= 23.5) || (doy === 1 && world.day > 1 && h < 0.7);
}
function spawnBurst() {
  const N = mobile ? 50 : 80, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 0.9 + Math.random() * 0.5;
    vel.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp]);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)], size: 0.3, map: sparkTex, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat); pts.userData.noTap = true; pts.frustumCulled = false;
  // au-dessus des toits, devant la caméra (visible où que tu sois dans le quartier)
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const o = controls.target.clone().addScaledVector(fwd, -1 + Math.random() * 3).addScaledVector(side, (Math.random() - 0.5) * 7);
  o.y = 2.6 + Math.random() * 1.4; // (la caméra regarde vers le sol : plus haut, on ne les verrait pas)
  scene.add(pts);
  bursts.push({ pts, vel, o, t: 0, life: 1.8 + Math.random() * 0.6 });
  if (opts.onBoom) opts.onBoom();
}
function updateFireworks(dt) {
  if (fwForce > 0) fwForce -= dt;
  if (fireworksOn() && (fwNext -= dt) <= 0) { fwNext = 0.35 + Math.random() * 0.6; spawnBurst(); }
  for (const b of bursts) {
    b.t += dt;
    const a = b.pts.geometry.attributes.position, k = b.t, g = 0.45 * k * k;
    for (let i = 0; i < b.vel.length; i++) { const v = b.vel[i]; a.setXYZ(i, b.o.x + v[0] * k, b.o.y + v[1] * k - g, b.o.z + v[2] * k); }
    a.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - b.t / b.life);
  }
  for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].t >= bursts[i].life) { scene.remove(bursts[i].pts); bursts[i].pts.geometry.dispose(); bursts[i].pts.material.dispose(); bursts.splice(i, 1); }
}

function updateAlive(dt) {
  const rate = opts.demo ? speed : (world.paused ? 0 : (world.speed || 1));
  updateWalkers(dt, rate);
  updateFireworks(dt);
  if (rate > 0) updateDucks(dt);
  updateEmergencies(dt, rate);
  updateWeather(dt);
  if (rate > 0) updatePigeons(dt);
  aliveTick -= dt;
  if (aliveTick <= 0) { aliveTick = 1; applySeason(); updateSnow(); updateLitter(); updateStands(); }
}

let savedCam = null;
const interior = opts.demo ? null : createInterior3D(renderer, {
  t: tr,
  icon: b => (b.type === 'home' ? '🏠' : TYPES[b.type].icon),
  actorById: id => world.actorById(id),
  leave: () => opts.onLeave && opts.onLeave(),
  onTap: (x, y, id) => opts.onInteriorTap && opts.onInteriorTap(x, y, id),
});
if (interior) interior.setVisible(false);
const clock = new THREE.Clock();
let speed = 1, frames = 0, fpsT = 0;
const $ = id => document.getElementById(id);
if (opts.demo) $('speed').onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 16 : 1; $('speed').textContent = `⏩ ×${speed}`; };
if (opts.demo) $('night').onclick = () => { forceNight = !forceNight; if (forceNight) { while (world.hour < 21 || world.hour > 22) world.step(1); } $('night').textContent = forceNight ? '☀️ Jour' : '🌙 Nuit'; if (!forceNight) while (world.hour < 10 || world.hour > 11) world.step(1); };

let dirty = true, acc = 0;
// Les shaders sont préparés tout de suite (sinon le premier affichage de chaque matériau fige l'image)
try { renderer.compile(scene, camera); } catch (e) { /* (rien de grave : ils seront compilés à l'affichage) */ }
controls.addEventListener('change', () => { dirty = true; });
let loopErrors = 0, shadowT = 0;
function loop() {
  try { frame(); } catch (err) { if (loopErrors++ < 3) console.error('Image 3D :', err); requestAnimationFrame(loop); }
}
function frame() {
  // Économie de batterie : 30 images/s au plus ; en pause, on ne redessine que si la caméra bouge
  const raw = clock.getDelta();
  // Le jeu avance à chaque image, même quand on ne redessine pas (une erreur du jeu ne bloque pas l'image)
  if (opts.onFrame) { try { opts.onFrame(raw * 1000); } catch (err) { if (loopErrors++ < 3) console.error('Jeu :', err); } }
  acc += raw;
  // Images par seconde plafonnées : 30 au téléphone (deux fois moins de travail → il ne chauffe plus), 20 en économie de batterie
  const capDt = opts.demo ? 0 : opts.saver ? 1 / 20 : mobile ? 1 / 30 : 0;
  if (capDt && acc < capDt - 0.003) { requestAnimationFrame(loop); return; }
  const dt = Math.min(acc, 0.1); acc = 0;
  // Résolution adaptative (pas en économie de batterie, déjà plafonnée à 30 images/s)
  if (!opts.saver && !opts.demo) {
    adaptive.frames++; adaptive.t += dt;
    if (adaptive.t >= 2) {
      const fps = adaptive.frames / adaptive.t; adaptive.frames = 0; adaptive.t = 0;
      let pr = pixelRatio;
      const target = capDt ? 1 / capDt : 60;
      if (fps < target * 0.75 && pr > PR_MIN) { pr = Math.max(PR_MIN, pr - 0.15); adaptive.calm = 0; }
      else if (fps < target * 0.68 && pr <= PR_MIN && ++adaptive.slow >= 2 && adaptive.level < 2) {
        // déjà à la résolution minimale : on retire d'abord le halo lumineux, puis on allège les ombres
        adaptive.slow = 0; adaptive.level++;
        if (adaptive.level === 1) composer = null;
        if (adaptive.level === 2 && sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } renderer.shadowMap.needsUpdate = true; }
      }
      else if (!mobile && fps > 55) { if (++adaptive.calm >= 3 && pr < PR_MAX) { pr = Math.min(PR_MAX, pr + 0.1); adaptive.calm = 0; } }
      else adaptive.calm = 0;
      if (pr !== pixelRatio) { pixelRatio = pr; renderer.setPixelRatio(pr); if (composer) composer.setPixelRatio(pr); api.pixelRatio = pr; }
    }
  }
  if (!opts.demo && world.paused && !dirty && !camGoal.t && !(opts.player && opts.player.inside != null)) { controls.update(); requestAnimationFrame(loop); return; }
  dirty = false;
  // (ombres : recalculées quand le soleil change de position, voir lighting())
  if (opts.demo) world.update(dt * 1000 * speed);
  const inside = !opts.demo && opts.player && opts.player.inside != null;
  const ictx = inside && interior && opts.interiorCtx ? opts.interiorCtx() : null;
  if (pinsEl) pinsEl.style.display = inside ? 'none' : '';
  if (ictx) {
    if (!interiorOn) { // on entre : on garde la vue de la ville pour la retrouver en sortant
      interiorOn = true;
      savedCam = { pos: camera.position.clone(), tgt: controls.target.clone(), min: controls.minDistance, max: controls.maxDistance, minP: controls.minPolarAngle, maxP: controls.maxPolarAngle };
      camGoal.t = null; interior.setVisible(true);
    }
    shadowT -= dt; if (shadowT <= 0) { shadowT = 1; renderer.shadowMap.needsUpdate = true; } // (les gens bougent dans la pièce)
    const info = interior.update(ictx, camera, performance.now());
    if (info) { // nouvelle pièce ou nouvel étage : cadrage
      const d = info.size * (mobile ? 1.75 : 1.5) + 3;
      controls.target.set(info.cx, 0.35, info.cz);
      camera.position.set(info.cx + d * 0.72, d * 0.78, info.cz + d * 0.72);
      controls.minDistance = 2.2; controls.maxDistance = d * 2.2; controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.25;
      renderer.shadowMap.needsUpdate = true;
    }
    controls.update();
    renderer.render(interior.scene, camera);
    requestAnimationFrame(loop); return;
  } else if (interiorOn) { // on sort : retour à la ville, là où on l'avait laissée
    interiorOn = false; interior.reset(); interior.setVisible(false);
    if (savedCam) { camera.position.copy(savedCam.pos); controls.target.copy(savedCam.tgt); Object.assign(controls, { minDistance: savedCam.min, maxDistance: savedCam.max, minPolarAngle: savedCam.minP, maxPolarAngle: savedCam.maxP }); }
    if (api.centerOnPlayer) api.centerOnPlayer();
  }
  if (inside) { requestAnimationFrame(loop); return; }
  const T0 = performance.now();
  updateCars(dt * Math.min(opts.demo ? speed : (world.paused ? 0 : (world.speed || 1)), 4));
  const T1 = performance.now();
  let newViews = 0;
  for (const a of world.actors) {
    let v = people.get(a.id);
    // (personnages préparés peu à peu : 4 par image au plus, et seulement ceux qui sont dehors → démarrage sans à-coup)
    if (!v) { if (!a.outdoors || (!a.isPlayer && newViews >= 4)) continue; newViews++; v = personView(a); people.set(a.id, v); }
    const show = a.outdoors;
    v.g.visible = show;
    if (!show) continue;
    const mx = a.px - v.last.x, my = a.py - v.last.y;
    const moving = Math.hypot(mx, my) > 0.0005;
    if (moving) { v.g.rotation.y = Math.atan2(mx, my); v.dir = [mx, my]; }
    v.last.x = a.px; v.last.y = a.py;
    // Sur son véhicule : vélo / trottinette / scooter sous la personne, voiture à sa place ; on roule sur sa voie
    const vk = a.vehicle && a.riding && a.path.length ? a.vehicle : null;
    if (v.vehKey !== vk) setVehicle(v, vk, a);
    const tile = T(Math.round(a.px), Math.round(a.py));
    let lane = 0;
    if (vk && tile && tile.ground === 'road') lane = vk === 'voiture' || vk === 'scooter' ? LANE.car : LANE.bike;
    v.lane += (lane - v.lane) * Math.min(1, dt * 6);
    const d = v.dir ? Math.hypot(v.dir[0], v.dir[1]) || 1 : 1;
    const ox = v.dir ? -(v.dir[1] / d) * v.lane : 0, oz = v.dir ? (v.dir[0] / d) * v.lane : 0;
    v.phase += dt * (moving && !vk ? 10 : 0);
    const pose = vk && vk !== 'voiture' ? 'sit' : moving && !vk ? 'walk' : a.doing === 'sit_bench' ? 'sit' : 'stand';
    const fr = Math.floor(v.phase / (Math.PI * 2 / WALK_FRAMES));
    const geo = figurePose(a.look, pose, fr);
    if (v.body.geometry !== geo) v.body.geometry = geo;
    v.g.position.set(a.px + ox, 0.08 + (moving && !vk ? Math.abs(Math.sin(v.phase)) * 0.008 : 0) - (pose === 'sit' && !vk ? 0.0 : 0), a.py + oz);
    for (const ch of v.g.children) if (ch.userData.bob) { ch.position.y = 0.55 + Math.sin(performance.now() / 180) * 0.04; ch.rotation.y += dt * 2; }
  }
  for (const [id, v] of people) if (!world.actorById(id)) { scene.remove(v.g); people.delete(id); }
  const T2 = performance.now();
  lighting();
  updateLights();
  controls.update();
  if (composer && bloom.strength > 0.02) composer.render(); else renderer.render(scene, camera);
  if (opts.demo) {
  const hh = Math.floor(world.hour), mm = Math.floor((world.hour % 1) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · J${world.day}`;
  frames++; fpsT += dt;
  if (fpsT > 1) { $('fps').textContent = `${Math.round(frames / fpsT)} img/s · ${renderer.info.render.calls} dessins`; frames = 0; fpsT = 0; }
  }
  const T3 = performance.now();
  updateAlive(dt);
  const T4 = performance.now();
  updateGame(dt);
  const T5 = performance.now();
  // (débogage : parties lentes de l'image, state.city3d.slow)
  if (T5 - T0 > 40) { (api.slow = api.slow || []).push({ cars: Math.round(T1 - T0), people: Math.round(T2 - T1), render: Math.round(T3 - T2), alive: Math.round(T4 - T3), game: Math.round(T5 - T4), min: world.minutes | 0 }); if (api.slow.length > 20) api.slow.shift(); }
  requestAnimationFrame(loop);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); });
window.three = { scene, sun, hemi, renderer, mats, camera, controls }; // débogage (console)
loop();
return api;
}
