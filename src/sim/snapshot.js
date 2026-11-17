// Photo de l'état du monde, en données simples (JSON).
// Indépendant du stockage : le même format servira pour un serveur multijoueur.
import { Actor } from './actor.js';

export const SNAPSHOT_VERSION = 2;

const ACTOR_FIELDS = [
  'money', 'energy', 'hunger', 'food', 'karma', 'items', 'job', 'px', 'py', 'facing', 'thinkIn',
  'home', 'housing', 'rentDue', 'rentLate', 'firedDay', 'lastApply', 'relations', 'routine',
  'owned', 'vehicle', 'referrals', 'taxWeek', 'mood', 'gifts', // ajoutés sans changer de version : les anciennes sauvegardes restent valides
  'hardDays', 'newcomer', 'fav', 'aidDay', 'role', 'lastRepair', 'goals', 'tips',
  'education', 'studies', 'studyDay', 'wanted', 'victimOf', 'sick', 'sickSince', 'jailUntil',
  'bank', 'loan', 'trial', 'prisonPay', 'prisonStudy', 'loyalty', 'exp', 'certs',
];
// Pour les nouveaux arrivants (absents de la liste de départ), on garde aussi qui ils sont
const NEWCOMER_FIELDS = ['name', 'look', 'role', 'controller'];

export function takeSnapshot(world, directors = []) {
  return {
    v: SNAPSHOT_VERSION,
    map: world.map.name,
    layout: world.map.layout,
    savedAt: Date.now(),
    city: world.city ? world.city.snapshot() : null,
    gov: world.gov ? world.gov.snapshot() : null,
    safety: world.safety ? world.safety.snapshot() : null,
    justice: world.justice ? world.justice.snapshot() : null,
    bank: world.bank ? world.bank.snapshot() : null,
    economy: world.economy ? world.economy.snapshot() : null,
    minutes: world.minutes,
    weather: world.weather,
    weatherIn: world.weatherIn,
    treasury: world.treasury || 0,
    actors: world.actors.map(a => {
      const o = { id: a.id };
      for (const f of ACTOR_FIELDS) o[f] = a[f];
      if (a.newcomer != null) for (const f of NEWCOMER_FIELDS) o[f] = a[f];
      // Infinity ne passe pas en JSON : « sur place » est stocké à part
      if (a.current) {
        o.current = a.current.id === 'stay'
          ? { id: 'stay', buildingId: a.current.buildingId }
          : { ...a.current };
      }
      if (a.plan) { o.plan = a.plan; o.path = a.path; }
      return o;
    }),
    directors: directors.map(d => ({ actor: d.actor.id, cool: d.cool, lastDay: d.lastDay, met: d.met, gap: d.gap, newsSeen: d.newsSeen || 0 })),
  };
}

// Renvoie true si la photo a pu être appliquée.
export function applySnapshot(world, directors, snap) {
  if (!snap || snap.v !== SNAPSHOT_VERSION || snap.map !== world.map.name) return false;
  world.minutes = snap.minutes;
  world.weather = snap.weather;
  world.weatherIn = snap.weatherIn;
  world.treasury = snap.treasury || 0;
  if (world.city) world.city.restore(snap.city);

  // Habitants partis du quartier
  const gone = new Set((snap.city && snap.city.gone) || []);
  world.actors = world.actors.filter(a => !gone.has(a.id));

  // Le plan du quartier a changé depuis la sauvegarde : chacun est replacé sur le nouveau tracé
  const moved = (snap.layout || 1) !== world.map.layout;

  for (const s of snap.actors) {
    let a = world.actors.find(x => x.id === s.id);
    if (!a && s.newcomer != null && s.look) { // nouvel arrivant : on le recrée
      a = world.addActor(new Actor({ id: s.id, name: s.name, look: s.look, role: s.role, controller: s.controller || 'ai', x: s.px, y: s.py }));
    }
    if (!a) continue;
    for (const f of ACTOR_FIELDS) if (s[f] !== undefined) a[f] = s[f];
    a.current = null; a.inside = null; a.plan = null; a.path = [];
    if (s.current) {
      if (s.current.id === 'stay') world.stay(a, s.current.buildingId);
      else { a.current = s.current; a.inside = s.current.buildingId; }
    }
    if (s.plan && !moved) { a.plan = s.plan; a.path = s.path || []; }
    if (moved || !world.map.walk(Math.round(a.px), Math.round(a.py))) {
      const p = world.map.nearestWalkable(a.px, a.py);
      a.px = p.x; a.py = p.y;
      a.thinkIn = 0;
    }
  }

  if (world.gov) world.gov.restore(snap.gov, world.day);
  if (world.safety) world.safety.restore(snap.safety);
  if (world.justice) world.justice.restore(snap.justice);
  if (world.bank) world.bank.restore(snap.bank);
  if (world.economy) world.economy.restore(snap.economy);

  for (const s of snap.directors || []) {
    const d = directors.find(x => x.actor.id === s.actor);
    if (!d) continue;
    d.cool = s.cool || {};
    d.lastDay = s.lastDay || {};
    d.met = s.met || {};
    d.gap = s.gap ?? d.gap;
    d.newsSeen = s.newsSeen || 0;
  }
  return true;
}
