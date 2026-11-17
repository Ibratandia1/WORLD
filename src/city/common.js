// Outils de la ville partagés par la 3D et l'interface, sans aucun moteur 2D :
// hasard reproductible, affluence selon l'heure, objets de rue touchables, emplacements des stands des fêtes.

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

// Affluence dans les rues selon l'heure (0 = désert, 1 = heure de pointe)
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

// Objets de rue touchables : statues, fontaines, bancs, poubelles (mêmes cases que le dessin 3D)
export function streetSpots(map) {
  const { w, h, tiles } = map;
  const ground = (x, y) => (tiles[y] && tiles[y][x] ? tiles[y][x].ground : null);
  const spots = { benches: [], fountains: [], statues: [], trees: [], bins: [] };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[y][x];
    if (t.deco === 'statue') spots.statues.push({ x, y });
    if (t.deco === 'fountain') spots.fountains.push({ x, y });
    if (t.deco === 'avtree' || !t.walk || (t.ground !== 'pave' && t.ground !== 'cobble')) continue;
    const side = ground(x, y + 1) === 'road' ? [0, 1] : ground(x, y - 1) === 'road' ? [0, -1]
      : ground(x + 1, y) === 'road' ? [1, 0] : ground(x - 1, y) === 'road' ? [-1, 0] : null;
    const along = side ? (side[1] ? x : y) : 0;
    if (side && t.ground === 'pave' && along % 8 === 5) spots.bins.push({ x, y, px: x + side[0] * 0.3, py: y + side[1] * 0.3 });
  }
  const bench = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[y][x];
    if (t.walk && t.ground === 'grass' && !t.deco && (x + y * 3) % 7 === 0) bench.push({ x, y });
    else if (t.walk && t.ground === 'cobble' && (x * 5 + y) % 13 === 0) bench.push({ x, y });
  }
  spots.benches = bench.slice(0, 28); // (même nombre que dans city3d.js)
  return spots;
}

// Emplacements des stands des fêtes (marché, brocante, concert, musiciens de rue), recalculés à chaque fête.
// Les stands sont dessinés en 3D (city3d.js) et touchables aux mêmes cases.
export class FestSpots {
  constructor(world) {
    this.world = world;
    this.map = world.map;
    this.spots = [];   // { x, y, fest, name, icon, actions }
    world.on('festivalStart', e => this.show(e.fest));
    world.on('festivalEnd', e => this.hide(e.fest));
  }

  // Cases libres (praticables, sans décor) autour d'un lieu, de façon déterministe
  freeTiles(cx, cy, r, grounds, n, seed) {
    const t = this.map.tiles, out = [];
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const c = t[y] && t[y][x];
      if (!c || !c.walk || c.deco || !grounds.includes(c.ground) || Math.hypot(x - cx, y - cy) > r || (x === cx && y === cy)) continue;
      out.push({ x, y });
    }
    const r2 = rng(seed);
    out.sort(() => r2() - 0.5);
    return out.slice(0, n);
  }

  show(fest) {
    if (!fest || this.spots.some(s => s.fest === fest.id)) return;
    const P = (this.map.places || {})[fest.where];
    const add = (x, y, name, icon, actions) => this.spots.push({ x, y, fest: fest.id, name, icon, actions });
    if (fest.id === 'marche' && P) this.freeTiles(P.x, P.y, 3.2, ['cobble', 'pave'], 7, 314).forEach(t => add(t.x, t.y, 'Stand du marché', '🧺', ['market_buy', 'crepe']));
    if (fest.id === 'brocante' && P) this.freeTiles(P.x, P.y, 3.5, ['grass', 'pave', 'cobble'], 6, 77).forEach(t => add(t.x, t.y, 'Table de brocante', '🏺', ['brocante_hunt', 'crepe']));
    if (fest.id === 'concert' && P) {
      const t = this.freeTiles(P.x, P.y, 2.5, ['grass', 'pave', 'cobble'], 1, 5)[0] || { x: P.x + 1, y: P.y };
      add(t.x, t.y, 'Concert', '🎻', ['dance']);
    }
    if (fest.id === 'musique') {
      const tl = this.map.tiles;
      const corners = this.map.footpaths.filter(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tl[p.y + dy] && tl[p.y + dy][p.x + dx] && tl[p.y + dy][p.x + dx].ground === 'road').length >= 2);
      const r2 = rng(2024);
      corners.sort(() => r2() - 0.5).slice(0, 6).forEach(p => add(p.x, p.y, 'Musiciens', '🎶', ['dance', 'crepe']));
    }
  }

  hide(fest) { if (fest) this.spots = this.spots.filter(s => s.fest !== fest.id); }
}
