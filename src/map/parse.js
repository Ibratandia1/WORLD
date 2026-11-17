import { TYPES } from './types.js';

// Transforme une carte texte en données de jeu : cases, bâtiments, entrées.
// Le même format de sortie servira quand la carte viendra de Tiled ou d'OpenStreetMap.
export function parseMap(def) {
  const rows = def.rows;
  const h = rows.length;
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`Carte : la ligne ${i} fait ${r.length} caractères au lieu de ${w}`);
  });

  const tiles = [];
  const buildings = [];
  const byLetter = {};

  // Identifiants stables : l'ordre `order` d'abord (les sauvegardes en dépendent), puis l'ordre d'apparition
  const make = ch => {
    const bdef = def.buildings[ch];
    const type = TYPES[bdef.type];
    const b = {
      id: buildings.length, letter: ch, type: bdef.type, name: bdef.name,
      rent: bdef.rent || 0, price: bdef.price || 0, jobs: bdef.jobs || null,
      units: bdef.units || (bdef.type === 'home' ? 1 : 0),
      height: type.height, tiles: [], entrances: [],
    };
    byLetter[ch] = b;
    buildings.push(b);
    return b;
  };
  for (const ch of def.order || '') if (def.buildings[ch] && rows.some(r => r.includes(ch))) make(ch);

  for (let y = 0; y < h; y++) {
    tiles.push([]);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const leg = def.legend[ch];
      if (leg) {
        tiles[y].push({ ground: leg.ground, walk: leg.walk, deco: leg.deco || null, building: null, avenue: !!leg.avenue });
        continue;
      }
      const bdef = def.buildings[ch];
      if (!bdef) throw new Error(`Carte : symbole inconnu "${ch}" en ${x},${y}`);
      const b = byLetter[ch] || make(ch);
      b.tiles.push({ x, y });
      tiles[y].push({ ground: 'pave', walk: false, deco: null, building: b.id });
    }
  }

  const walk = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y][x].walk;

  // Entrées = cases praticables collées à un bâtiment.
  const entranceMap = new Map();
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const b of buildings) {
    for (const t of b.tiles) {
      for (const [dx, dy] of DIRS) {
        const nx = t.x + dx, ny = t.y + dy;
        if (!walk(nx, ny)) continue;
        const k = `${nx},${ny}`;
        const list = entranceMap.get(k) || [];
        if (!list.includes(b.id)) {
          list.push(b.id);
          entranceMap.set(k, list);
          b.entrances.push({ x: nx, y: ny });
        }
      }
    }
  }

  // Carrefours (feux tricolores) et passages piétons : la case de rue juste avant chaque carrefour.
  // crossing.axis = sens des voitures sur cette case ('x' ou 'y') ; j = carrefour dont le feu la règle.
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y][x].ground === 'road';
  const links = (x, y) => ({ e: isRoad(x + 1, y), w: isRoad(x - 1, y), s: isRoad(x, y + 1), n: isRoad(x, y - 1) });
  const straightAt = (x, y) => { const l = links(x, y), n = l.e + l.w + l.s + l.n; return n === 1 || (n === 2 && ((l.e && l.w) || (l.n && l.s))); };
  const junctions = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRoad(x, y) && !straightAt(x, y)) junctions.push({ x, y });
  const isJ = (x, y) => isRoad(x, y) && !straightAt(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isRoad(x, y) || !straightAt(x, y)) continue;
    const l = links(x, y);
    const axis = l.e || l.w ? 'x' : 'y';
    const near = axis === 'x' ? [[x + 1, y], [x - 1, y]] : [[x, y + 1], [x, y - 1]];
    const j = near.find(([a, b]) => isJ(a, b));
    if (j) tiles[y][x].crossing = { axis, jx: j[0], jy: j[1] };
  }

  const walkable = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walk(x, y)) walkable.push({ x, y });

  // Trottoirs, ruelles et places : là où flânent les passants
  const footpaths = walkable.filter(p => tiles[p.y][p.x].ground !== 'road');
  // Case praticable la plus proche (pour replacer quelqu'un quand le plan change)
  const nearestWalkable = (x, y) => {
    let best = walkable[0], bd = Infinity;
    for (const p of walkable) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  };

  return {
    name: def.name, layout: def.layout || 1, places: def.places || {}, w, h, tiles, buildings, byLetter, entranceMap, walk,
    walkable, footpaths, nearestWalkable, junctions,
    randomWalkable: () => walkable[Math.floor(Math.random() * walkable.length)],
    randomFootpath: () => footpaths[Math.floor(Math.random() * footpaths.length)],
  };
}
