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

  for (let y = 0; y < h; y++) {
    tiles.push([]);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const leg = def.legend[ch];
      if (leg) {
        tiles[y].push({ ground: leg.ground, walk: leg.walk, deco: leg.deco || null, building: null });
        continue;
      }
      const bdef = def.buildings[ch];
      if (!bdef) throw new Error(`Carte : symbole inconnu "${ch}" en ${x},${y}`);
      let b = byLetter[ch];
      if (!b) {
        const type = TYPES[bdef.type];
        b = {
          id: buildings.length, letter: ch, type: bdef.type, name: bdef.name,
          rent: bdef.rent || 0, price: bdef.price || 0, jobs: bdef.jobs || null,
          height: type.height, tiles: [], entrances: [],
        };
        byLetter[ch] = b;
        buildings.push(b);
      }
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

  const walkable = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walk(x, y)) walkable.push({ x, y });

  return {
    name: def.name, w, h, tiles, buildings, byLetter, entranceMap, walk,
    randomWalkable: () => walkable[Math.floor(Math.random() * walkable.length)],
  };
}
