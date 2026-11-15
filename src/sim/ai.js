import { shiftNow, openings } from './jobs.js';
import { nearby, canPause } from './social.js';

// Heure du coucher : assez tôt pour 8 h de sommeil avant le service du lendemain
const bedtimeOf = a => (a.job ? (a.job.start + 24 - 8.75) % 24 : 23);
const isBedtime = (h, bt) => ((h - bt + 24) % 24) < 6;

// Cerveau des PNJ, et routine automatique du joueur (opts.player).
// Il ne fait que choisir : l'action passe ensuite par world.perform comme pour tout le monde.
export function decide(a, w, opts = {}) {
  const h = w.hour;
  const player = !!opts.player;

  // 1. Payer ses dettes de loyer dès que possible
  if (a.housing === 'rent' && a.rentDue > 0 && a.money >= a.rentDue) return { id: 'pay_rent' };

  // 2a. Métiers de rue (facteur, police) : tournée dans le quartier pendant le service
  if (a.job && a.job.street && shiftNow(a.job, w)) {
    if (a.hunger > 80 && a.money >= 4) return { id: 'eat_bakery' };
    return { id: 'goto', params: w.map.randomWalkable() };
  }

  // 2b. Aller travailler : on part en avance, on mange vite si besoin
  const s = a.job && !a.job.street && shiftNow(a.job, w);
  if (s && w.minutes < s.end - 30 && a.energy > 8) {
    if (a.hunger > 70 && a.money >= 4 && w.minutes < s.start - 35) return { id: 'eat_bakery' };
    if (w.minutes >= s.start - 45) return { id: 'work' };
    return null; // trop tôt : on attend, sans se lancer dans une longue activité
  }

  // 3. Dormir
  if (a.energy < 22 || (isBedtime(h, bedtimeOf(a)) && a.energy < 90)) {
    return { id: a.home != null ? 'sleep' : 'sleep_rough' };
  }

  // 4. Manger
  // (les commerces ne servent que s'il y a un vendeur : on prend la première option possible)
  const ok = id => w.check(a, id) === true;
  if (a.hunger > 55) {
    if (a.food > 0 && a.home != null) return { id: 'eat_home' };
    if (a.money > 40 && ok('eat_cafe')) return { id: 'eat_cafe' };
    if (ok('eat_bakery')) return { id: 'eat_bakery' };
  }
  if (a.home != null && a.food < 2 && a.money > 60 && ok('groceries')) return { id: 'groceries' };

  // 5. Chercher du travail
  if (!a.job && a.role !== 'landlord' && h >= 8 && h < 18) {
    const b = w.map.buildings.find(b => openings(w, b) > 0 && a.lastApply[b.id] !== w.day);
    if (b) return { id: 'apply', params: { building: b.id } };
  }

  // Moral bas : on se détend (télé à la maison, livre, banc) — PNJ comme routine du joueur
  if (a.mood < (player ? 45 : 35)) {
    if (a.home != null && Math.random() < (player ? 0.7 : 0.4)) return { id: Math.random() < 0.6 ? 'watch_tv' : 'read_book' };
    if (a.outdoors && Math.random() < 0.4) return { id: 'sit_bench' };
  }

  if (player) return null; // la routine du joueur ne flâne pas toute seule

  // 6. Vie sociale et flânerie des PNJ
  // (les PNJ discutent entre eux, jamais en interrompant le joueur)
  const others = nearby(w, a).filter(o => o.controller !== 'player' && !o.doing && canPause(o, w));
  if (others.length && Math.random() < 0.2) return { id: 'talk', params: { who: others[Math.floor(Math.random() * others.length)].id } };
  const r = Math.random();
  if (r < 0.15 && a.money > 10) return { id: 'coffee' };
  if (r < 0.2 && a.money > 20) return { id: 'scratch' };
  return { id: 'goto', params: w.map.randomWalkable() };
}
