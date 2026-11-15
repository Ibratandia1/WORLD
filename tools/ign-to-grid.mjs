// Convertit la BD TOPO® téléchargée (data/ign/*.json) en grille de jeu.
// Usage : node tools/ign-to-grid.mjs  → data/ign/grid.json
// Une case = CELL mètres. Bâtiments = numéro + hauteur + usage ; rues = '=' ; voies piétonnes = ':' ;
// végétation = 'g' / 'T' ; eau = 'w' ; le reste = trottoir '.'.
import { readFileSync, writeFileSync } from 'node:fs';
import { AREA } from './ign-fetch.mjs';

const CELL = 6;
const load = n => JSON.parse(readFileSync(`data/ign/${n}.json`, 'utf8')).features;

// Projection locale en mètres (assez précise à l'échelle d'un quartier)
const lat0 = (AREA.south + AREA.north) / 2;
const MX = 111320 * Math.cos(lat0 * Math.PI / 180), MY = 110540;
const toM = ([lon, lat]) => [(lon - AREA.west) * MX, (AREA.north - lat) * MY]; // y vers le sud
const W = Math.floor((AREA.east - AREA.west) * MX / CELL);
const H = Math.floor((AREA.north - AREA.south) * MY / CELL);

const polys = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = g => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

// Cases dont le centre est dans le polygone (anneaux : extérieur + trous)
function rasterPoly(rings, cb) {
  const R = rings.map(r => r.map(toM));
  const xs = R[0].map(p => p[0]), ys = R[0].map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) / CELL)), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) / CELL));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) / CELL)), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) / CELL));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
    let inside = false;
    for (const ring of R) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) cb(x, y);
  }
}

// Cases à moins de `half` mètres d'une polyligne
function rasterLine(coords, half, cb) {
  const P = coords.map(toM);
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1];
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - half) / CELL)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + half) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - half) / CELL)), y1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + half) / CELL));
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2));
      if (Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) <= half) cb(x, y);
    }
  }
}

const ground = Array.from({ length: H }, () => Array(W).fill('.'));
const owner = Array.from({ length: H }, () => Array(W).fill(-1));

// 1. Eau et végétation
for (const f of load('eau')) for (const p of polys(f.geometry)) rasterPoly(p, (x, y) => { ground[y][x] = 'w'; });
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (const f of load('vegetation')) for (const p of polys(f.geometry)) rasterPoly(p, (x, y) => { if (ground[y][x] !== 'w') ground[y][x] = rnd() < 0.18 ? 'T' : 'g'; });

// 2. Rues (largeur réelle quand elle est connue)
const PEDESTRIAN = /chemin|sentier|escalier|piét|pieton/i;
let named = new Set();
for (const f of load('route')) {
  const p = f.properties;
  const ped = PEDESTRIAN.test(p.nature || '') || p.acces_vehicule_leger === 'Physiquement impossible';
  const width = p.largeur_de_chaussee || (ped ? 4 : 7);
  if (p.nom_1_gauche) named.add(p.nom_1_gauche);
  for (const l of lines(f.geometry)) rasterLine(l, Math.max(CELL * 0.55, width / 2), (x, y) => {
    if (ground[y][x] === 'w') return;
    ground[y][x] = ped ? (ground[y][x] === '=' ? '=' : ':') : '=';
  });
}

// 3. Bâtiments (par-dessus le reste : la rue ne traverse pas les immeubles)
const buildings = [];
for (const f of load('batiment')) {
  const p = f.properties;
  if (p.construction_legere) continue;
  const id = buildings.length;
  const b = { id, h: p.hauteur || (p.nombre_d_etages ? p.nombre_d_etages * 3.2 : 10), floors: p.nombre_d_etages || null,
    usage: p.usage_1 || 'Indifférencié', usage2: p.usage_2 || null, homes: p.nombre_de_logements || 0, tiles: 0 };
  for (const poly of polys(f.geometry)) rasterPoly(poly, (x, y) => {
    if (ground[y][x] === 'w') return;
    owner[y][x] = id; ground[y][x] = 'B'; b.tiles++;
  });
  if (b.tiles) buildings.push(b); else buildings.push(null);
}

// 4. Lisibilité en jeu : les rues de Paris sont étroites, on les élargit un peu et on ajoute un trottoir,
//    en rognant le bord des immeubles (sinon la rue disparaît derrière les toits en vue isométrique)
for (const f of load('route')) {
  const p = f.properties;
  const ped = PEDESTRIAN.test(p.nature || '') || p.acces_vehicule_leger === 'Physiquement impossible';
  const width = p.largeur_de_chaussee || (ped ? 4 : 7);
  const road = Math.max(CELL, width / 2 + 1.5), walk = road + 4.5;
  for (const l of lines(f.geometry)) {
    rasterLine(l, walk, (x, y) => { if (ground[y][x] === 'B') { ground[y][x] = ped ? ':' : '.'; owner[y][x] = -1; } });
    if (!ped) rasterLine(l, road, (x, y) => { if (ground[y][x] !== 'w') { ground[y][x] = '='; owner[y][x] = -1; } });
  }
}
const rows = ground.map(r => r.join(''));
const out = { cell: CELL, w: W, h: H, area: AREA, rows, owner, buildings, streets: [...named].sort() };
writeFileSync('data/ign/grid.json', JSON.stringify(out));
const count = c => rows.join('').split(c).length - 1;
console.log(`grille ${W}×${H} (${CELL} m/case) · bâtiments ${buildings.filter(Boolean).length} · cases bâties ${count('B')} · rue ${count('=')} · piéton ${count(':')} · vert ${count('g') + count('T')} · eau ${count('w')}`);
console.log('rues :', out.streets.slice(0, 30).join(', '));
