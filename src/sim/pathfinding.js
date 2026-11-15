const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Recherche en largeur vers la première case qui satisfait isGoal(x, y).
// Renvoie { path, goal } (path sans la case de départ) ou null.
export function findPath(map, start, isGoal) {
  const sx = Math.round(start.x), sy = Math.round(start.y);
  if (isGoal(sx, sy)) return { path: [], goal: { x: sx, y: sy } };

  const key = (x, y) => y * map.w + x;
  const startKey = key(sx, sy);
  const prev = new Map([[startKey, -1]]);
  const queue = [[sx, sy]];

  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!map.walk(nx, ny)) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, key(x, y));
      if (isGoal(nx, ny)) {
        const path = [];
        for (let c = k; c !== startKey; c = prev.get(c)) path.unshift({ x: c % map.w, y: Math.floor(c / map.w) });
        return { path, goal: { x: nx, y: ny } };
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}
