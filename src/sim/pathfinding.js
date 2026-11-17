const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Coût d'une case : on préfère les trottoirs et les ruelles, on traverse sur les passages piétons.
// Traverser ailleurs est interdit (amende si la police voit) : très coûteux, donc presque jamais choisi.
const CROSSING_COST = 2;
const JAYWALK_COST = 60;
// À pied : trottoirs, ruelles, parcs ; la chaussée seulement sur les passages piétons.
// À vélo : la piste cyclable (bord de la chaussée) d'abord, le trottoir au pas si besoin.
// En voiture / scooter : la chaussée ; le trottoir seulement pour rejoindre la porte, jamais les parcs.
const COSTS = {
  walk: t => (t.ground !== 'road' ? 1 : t.crossing ? CROSSING_COST : JAYWALK_COST),
  bike: t => (t.ground === 'road' ? 0.6 : t.ground === 'grass' || t.ground === 'gravel' ? 2.5 : 1.6),
  motor: t => (t.ground === 'road' ? 0.4 : t.ground === 'grass' || t.ground === 'gravel' ? 30 : 4),
};

// Plus court chemin (Dijkstra) vers la première case qui satisfait isGoal(x, y).
// Renvoie { path, goal } (path sans la case de départ) ou null. mode : 'walk' | 'bike' | 'motor'.
export function findPath(map, start, isGoal, mode = 'walk') {
  const cost = COSTS[mode] || COSTS.walk;
  const costOf = (m, x, y) => cost(m.tiles[y][x]);
  const sx = Math.round(start.x), sy = Math.round(start.y);
  if (isGoal(sx, sy)) return { path: [], goal: { x: sx, y: sy } };

  const W = map.w;
  const key = (x, y) => y * W + x;
  const startKey = key(sx, sy);
  const dist = new Map([[startKey, 0]]);
  const prev = new Map([[startKey, -1]]);
  const heap = new Heap();
  heap.push(0, startKey);

  while (heap.size) {
    const [d, k] = heap.pop();
    if (d > dist.get(k)) continue;
    const x = k % W, y = Math.floor(k / W);
    if (k !== startKey && isGoal(x, y)) {
      const path = [];
      for (let c = k; c !== startKey; c = prev.get(c)) path.unshift({ x: c % W, y: Math.floor(c / W) });
      return { path, goal: { x, y } };
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!map.walk(nx, ny)) continue;
      const nk = key(nx, ny);
      const nd = d + costOf(map, nx, ny);
      if (nd >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, nd);
      prev.set(nk, k);
      heap.push(nd, nk);
    }
  }
  return null;
}

// Petit tas binaire (file de priorité)
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, v) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}
