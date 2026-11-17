import { shiftNow, openings } from './jobs.js';
import { nearby, canPause } from './social.js';
import { ACTIONS } from './actions.js';
import { priceMul } from './city.js';
import { festById } from './festivals.js';
import { isPolice, onDuty, jailed } from './safety.js';

// Heure du coucher : assez tôt pour 8 h de sommeil avant le service du lendemain
// Routine automatique du joueur : probabilité d'une tentation à chaque décision, part de mauvais choix, jours « sans »
const ROUTINE_TEMPT = 0.016;
const ROUTINE_BAD = 0.65;
const ROUTINE_SLACK = 0.12;

const bedtimeOf = a => (a.job ? (a.job.start + 24 - 8.75) % 24 : 23);
const isBedtime = (h, bt) => ((h - bt + 24) % 24) < 6;

// Où aller ? Chacun choisit parmi les commerces ouverts : plutôt proche, plutôt pas cher,
// et on a ses adresses préférées (qui changent de temps en temps). C'est ce qui fait vivre ou couler un commerce.
function shop(a, w, id) {
  const def = ACTIONS[id];
  if (w.check(a, id) !== true) return null;
  const ids = [...w.openIds(a, def)];
  if (!ids.length) return null;
  a.fav = a.fav || {};
  const type = def.place.type;
  const weights = ids.map(bid => {
    const e = w.building(bid).entrances[0];
    const d = Math.abs(e.x - a.px) + Math.abs(e.y - a.py);
    let wt = 1 / (1 + d / 8);
    wt /= priceMul(w, bid) ** 4;
    if (a.fav[type] === bid) wt *= 3;
    return wt;
  });
  let r = Math.random() * weights.reduce((t, x) => t + x, 0);
  let at = ids[ids.length - 1];
  for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) { at = ids[i]; break; } }
  if (a.fav[type] !== at && Math.random() < 0.2) a.fav[type] = at; // nouvelle adresse fétiche
  const params = { at };
  return w.check(a, id, params) === true ? { id, params } : null;
}

// Cerveau des PNJ, et routine automatique du joueur (opts.player).
// Il ne fait que choisir : l'action passe ensuite par world.perform comme pour tout le monde.
export function decide(a, w, opts = {}) {
  const h = w.hour;
  const player = !!opts.player;

  // 1. Payer ses dettes de loyer dès que possible
  if (a.housing === 'rent' && a.rentDue > 0 && a.money >= a.rentDue) return { id: 'pay_rent' };

  // 1b. Sans logement (nouvel arrivant, expulsé) : louer un appartement libre et abordable
  if (!player && a.home == null && w.city && a.role !== 'landlord') {
    const b = w.city.homeFor(a);
    if (b) return { id: 'rent_home', params: { building: b.id } };
  }

  // 1c. Pompiers de service : un incendie passe avant tout
  const sf = w.safety;
  if (sf && Object.keys(sf.fires).length && onDuty(w, a, 'firestation')) {
    const fire = +Object.keys(sf.fires)[0];
    if (w.check(a, 'extinguish', { building: fire }) === true) return { id: 'extinguish', params: { building: fire } };
  }

  // 1d. Police en patrouille : on va arrêter les personnes recherchées (jamais le joueur sans raison : seulement s'il est recherché)
  if (sf && isPolice(a) && shiftNow(a.job, w)) {
    const t = w.actors.filter(o => o !== a && o.wanted > 0 && o.outdoors && !jailed(w, o))
      .sort((x, y) => Math.hypot(x.px - a.px, x.py - a.py) - Math.hypot(y.px - a.px, y.py - a.py))[0];
    if (t && Math.hypot(t.px - a.px, t.py - a.py) < 14) {
      if (w.check(a, 'arrest', { who: t.id }) === true) return { id: 'arrest', params: { who: t.id } };
      return { id: 'goto', params: { x: Math.round(t.px), y: Math.round(t.py) } };
    }
  }

  // 1e. Malade : chez le médecin (si on peut payer)
  if (a.sick && a.money > 30 && !player) { const c = shop(a, w, 'consult'); if (c) return c; }

  // 1f. La misère pousse parfois au vol (jamais le joueur : c'est à lui de choisir)
  const poor = a.money < 25 && (!a.job || (a.hardDays || 0) >= 1) && (a.karma || 0) < 2;
  const thug = (a.karma || 0) <= -3 && Math.random() < 0.25; // un tempérament de voyou : ça le démange même sans besoin
  if (!player && sf && (poor || thug)) {
    const night = w.hour >= 23 || w.hour < 5;
    if (night && Math.random() < 0.04) {
      const homes = w.map.buildings.filter(b => b.type === 'home' && b.id !== a.home);
      const b = homes[Math.floor(Math.random() * homes.length)];
      if (b && w.check(a, 'burgle', { building: b.id }) === true) return { id: 'burgle', params: { building: b.id } };
    }
    if (Math.random() < 0.06) {
      const v = nearby(w, a).find(o => !isPolice(o) && o.money > 20 && o.controller !== 'player');
      if (v && w.check(a, 'steal', { who: v.id }) === true) return { id: 'steal', params: { who: v.id } };
      if (w.check(a, 'shoplift') === true && Math.random() < 0.5) return { id: 'shoplift' };
    }
  }

  // 1g. Routine automatique du joueur : pratique, mais pas sans risque. Laissé à lui-même, ton personnage
  // peut mal tourner (plus souvent que bien) : vol, vol à l'étalage, cambriolage la nuit, pot-de-vin, jeux d'argent…
  // et certains jours il ne se lève pas pour aller travailler. Mêmes actions que tout le monde (world.perform).
  if (player && a.routine && sf && !jailed(w, a)) {
    if (a.slackDay !== w.day) { a.slackDay = w.day; a.slacking = Math.random() < ROUTINE_SLACK; }
    if (Math.random() < ROUTINE_TEMPT) {
      const night = w.hour >= 23 || w.hour < 5;
      const tryAct = (id, params = {}) => (w.check(a, id, params) === true ? { id, params } : null);
      let pick = null;
      if (Math.random() < ROUTINE_BAD) { // le côté sombre
        const v = nearby(w, a).find(o => !isPolice(o) && o.money > 20);
        const homes = w.map.buildings.filter(b => b.type === 'home' && b.id !== a.home);
        const options = [
          () => tryAct('take_bribe'),
          () => (v ? tryAct('steal', { who: v.id }) : null),
          () => tryAct('shoplift'),
          () => (night && homes.length ? tryAct('burgle', { building: homes[Math.floor(Math.random() * homes.length)].id }) : null),
          () => (a.money > 10 ? shop(a, w, 'scratch') : null),
        ].sort(() => Math.random() - 0.5);
        for (const f of options) { pick = f(); if (pick) break; }
      } else { // un bon geste
        pick = tryAct('pick_litter');
      }
      if (pick) { a.routineDeeds = (a.routineDeeds || 0) + 1; return pick; }
    }
  }

  // 2a. Métiers de rue (facteur, police) : tournée dans le quartier pendant le service
  if (a.job && a.job.street && shiftNow(a.job, w)) {
    if (a.hunger > 80 && a.money >= 4) { const c = shop(a, w, 'eat_bakery'); if (c) return c; }
    return { id: 'goto', params: w.map.randomFootpath() };
  }

  // 2b. Aller travailler : on part en avance, on mange vite si besoin
  const s = a.job && !a.job.street && shiftNow(a.job, w);
  if (s && w.minutes < s.end - 30 && a.energy > 8 && !(player && a.routine && a.slacking)) { // (routine : jours « sans »)
    if (a.hunger > 45 && a.money >= 4 && w.minutes < s.start - 35) { const c = shop(a, w, 'eat_bakery'); if (c) return c; }
    if (w.minutes >= s.start - 45) return { id: 'work' };
    return null; // trop tôt : on attend, sans se lancer dans une longue activité
  }

  // 3. Dormir
  if (a.energy < 22 || (isBedtime(h, bedtimeOf(a)) && a.energy < 90)) {
    return { id: a.home != null ? 'sleep' : 'sleep_rough' };
  }

  // 4. Manger (les commerces ne servent que s'il y a un vendeur)
  // Le matin, un croissant à la boulangerie ; à midi et le soir, on cuisine ou on va au café
  if (h >= 6 && h < 10 && a.hunger > 30 && a.money > 8 && Math.random() < 0.6) {
    const c = shop(a, w, 'eat_bakery'); if (c) return c;
  }
  if (a.hunger > 55) {
    if (a.food > 0 && a.home != null && Math.random() < 0.7) return { id: 'eat_home' };
    if (a.money > 40) { const c = shop(a, w, 'eat_cafe'); if (c) return c; }
    const c = shop(a, w, 'eat_bakery'); if (c) return c;
    if (a.food > 0 && a.home != null) return { id: 'eat_home' };
  }
  if (a.home != null && a.food < 2 && a.money > 60) { const c = shop(a, w, 'groceries'); if (c) return c; }

  // 4b. Citoyens : voter pendant les élections, demander l'aide sociale quand on est à court
  const g = w.gov;
  if (!player && g && g.votingOpen && !g.votes[a.id] && h >= 9 && h < 17 && Math.random() < 0.5) {
    const f = g.choose(a);
    if (f && w.check(a, 'vote', { for: f }) === true) return { id: 'vote', params: { for: f } };
  }
  if (!player && (!a.job || a.job.street) && a.money < 120 && w.check(a, 'allocation') === true) return { id: 'allocation' };

  // 4c. Banque : on met de côté le surplus, on retire quand la poche est vide, on emprunte pour un loyer en retard
  if (!player && w.bank && h >= 9 && h < 17) {
    const bankDo = (id, amount) => { const c = shop(a, w, id); if (!c) return null; c.params.amount = amount; return w.check(a, id, c.params) === true ? c : null; };
    if (a.money > 700 && Math.random() < 0.3) { const c = bankDo('deposit', Math.floor(a.money - 300)); if (c) return c; }
    if (a.money < 40 && (a.bank || 0) >= 1) { const c = bankDo('withdraw', Math.min(150, Math.floor(a.bank))); if (c) return c; }
    if (a.rentDue > a.money && !(a.loan > 0) && a.job && Math.random() < 0.3) { const c = shop(a, w, 'take_loan'); if (c) return c; }
  }

  // 5. Chercher du travail (on postule un peu partout, pas toujours au même endroit), ou reprendre ses études
  if (!a.job && a.role !== 'landlord' && h >= 8 && h < 18) {
    if ((a.education ?? 1) < 2 && a.money > 60 && Math.random() < 0.25) { const c = shop(a, w, 'study'); if (c) return c; }
    const list = w.map.buildings.filter(b => openings(w, b) > 0 && a.lastApply[b.id] !== w.day && (b.jobs.edu || 0) <= (a.education ?? 1));
    if (list.length) return { id: 'apply', params: { building: list[Math.floor(Math.random() * list.length)].id } };
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
  // Les fêtes du quartier attirent du monde : on y va, puis on y participe (une fois par fête et par jour)
  const fests = w.festivals ? [...w.festivals.active] : [];
  if (fests.length) {
    a.festDay = a.festDay || {};
    const here = w.festivals.around(a).filter(id => a.festDay[id] !== w.day);
    if (here.length) {
      const id = here[0];
      const pick = { marche: ['market_buy', 'crepe'], brocante: ['brocante_hunt', 'crepe'], concert: ['dance'], musique: ['dance', 'crepe'] }[id];
      const act = pick.find(x => w.check(a, x) === true && (x !== 'crepe' || a.hunger > 30));
      a.festDay[id] = w.day;
      if (act) return { id: act };
    } else {
      const want = fests.find(id => a.festDay[id] !== w.day && id !== 'musique');
      if (want && r < 0.45 && w.weather !== 'rain' && w.weather !== 'snow') return { id: 'goto', params: w.festivals.target(festById(want)) };
      if (fests.includes('musique') && a.festDay.musique !== w.day && r < 0.3) return { id: 'goto', params: w.map.randomFootpath() };
    }
  }
  // La météo change les habitudes : sous la pluie ou la neige on se réfugie au café ou chez soi,
  // aux beaux jours on traîne dehors (bancs, terrasses)
  const wet = w.weather === 'rain' || w.weather === 'snow';
  if (wet && a.outdoors && r < 0.6) {
    if (a.money > 10 && Math.random() < 0.55) { const c = shop(a, w, 'coffee'); if (c) return c; }
    if (a.home != null) return { id: 'enter', params: { building: a.home } };
  }
  if (!wet && w.weather === 'sun' && a.outdoors && (w.season === 'ete' || w.season === 'printemps') && h >= 10 && h < 20 && r < 0.12) {
    if (a.money > 30 && Math.random() < 0.5) { const c = shop(a, w, 'eat_cafe'); if (c && a.hunger > 30) return c; }
    return { id: 'sit_bench' };
  }
  // Un véhicule s'entretient ; quand on a de l'argent de côté, on se fait plaisir
  if (a.vehicle && a.money > 80 && (a.lastRepair == null || w.day - a.lastRepair >= 7) && Math.random() < 0.3) { const c = shop(a, w, 'repair'); if (c) return c; }
  if (a.money > 500 && Math.random() < Math.min(0.25, a.money / 8000)) { const c = shop(a, w, 'shopping'); if (c) return c; }
  if (r < 0.15 && a.money > 10) { const c = shop(a, w, 'coffee'); if (c) return c; }
  if (r < 0.2 && a.money > 20) { const c = shop(a, w, 'scratch'); if (c) return c; }
  return { id: 'goto', params: w.map.randomFootpath() };
}
