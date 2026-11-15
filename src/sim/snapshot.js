// Photo de l'état du monde, en données simples (JSON).
// Indépendant du stockage : le même format servira pour un serveur multijoueur.
export const SNAPSHOT_VERSION = 2;

const ACTOR_FIELDS = [
  'money', 'energy', 'hunger', 'food', 'karma', 'items', 'job', 'px', 'py', 'facing', 'thinkIn',
  'home', 'housing', 'rentDue', 'rentLate', 'firedDay', 'lastApply', 'relations', 'routine',
  'owned', 'vehicle', 'referrals', 'taxWeek', 'mood', 'gifts', // ajoutés sans changer de version : les anciennes sauvegardes restent valides
];

export function takeSnapshot(world, directors = []) {
  return {
    v: SNAPSHOT_VERSION,
    map: world.map.name,
    savedAt: Date.now(),
    minutes: world.minutes,
    weather: world.weather,
    weatherIn: world.weatherIn,
    treasury: world.treasury || 0,
    actors: world.actors.map(a => {
      const o = { id: a.id };
      for (const f of ACTOR_FIELDS) o[f] = a[f];
      // Infinity ne passe pas en JSON : « sur place » est stocké à part
      if (a.current) {
        o.current = a.current.id === 'stay'
          ? { id: 'stay', buildingId: a.current.buildingId }
          : { ...a.current };
      }
      if (a.plan) { o.plan = a.plan; o.path = a.path; }
      return o;
    }),
    directors: directors.map(d => ({ actor: d.actor.id, cool: d.cool, lastDay: d.lastDay, met: d.met, gap: d.gap })),
  };
}

// Renvoie true si la photo a pu être appliquée.
export function applySnapshot(world, directors, snap) {
  if (!snap || snap.v !== SNAPSHOT_VERSION || snap.map !== world.map.name) return false;
  world.minutes = snap.minutes;
  world.weather = snap.weather;
  world.weatherIn = snap.weatherIn;
  world.treasury = snap.treasury || 0;

  for (const s of snap.actors) {
    const a = world.actors.find(x => x.id === s.id);
    if (!a) continue;
    for (const f of ACTOR_FIELDS) if (s[f] !== undefined) a[f] = s[f];
    a.current = null; a.inside = null; a.plan = null; a.path = [];
    if (s.current) {
      if (s.current.id === 'stay') world.stay(a, s.current.buildingId);
      else { a.current = s.current; a.inside = s.current.buildingId; }
    }
    if (s.plan) { a.plan = s.plan; a.path = s.path || []; }
  }

  for (const s of snap.directors || []) {
    const d = directors.find(x => x.actor.id === s.actor);
    if (!d) continue;
    d.cool = s.cool || {};
    d.lastDay = s.lastDay || {};
    d.met = s.met || {};
    d.gap = s.gap ?? d.gap;
  }
  return true;
}
