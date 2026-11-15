import { shiftNow, shiftOf, todayLog, isWorkday, fmtShift, openings, makeJob, nextShift, DAY_NAMES, weekdayOf, sellerAt, incomeTax } from './jobs.js';
import { weeklyRent, occupants } from './housing.js';
import { addRel, near, rel, reply, tip as jobTip, canPause } from './social.js';
import { itemById, hasPhone } from './catalog.js';

// RÈGLE D'OR : toutes les actions du jeu sont ici, et le joueur comme les PNJ
// passent par world.perform(acteur, id, params). Un futur joueur en ligne
// enverra exactement les mêmes demandes.
//
// Champs d'une action :
//   place       où elle se fait : { type: 'cafe' } (le plus proche), { own: 'home' | 'job' }, { param: 'building' }
//   here        se fait là où l'on est (discussion…)      instant  sans durée
//   duration    minutes de jeu  (ou durationFor(a, w, p))  skip     accélération du temps pendant l'action (joueur)
//   cost        prix payé au début (nombre ou fonction (a, w, p))
//   can         (a, w, p) => true | 'raison du refus'
//   onStart / tick(a, w, dt) / effect(a, w, p) => message optionnel

const target = (w, p) => w.actorById(p.who);
// Proche, ou joignable par téléphone si on se connaît
export const canReach = (a, t) => near(a, t) || ((hasPhone(a) || hasPhone(t)) && rel(a, t) >= 10);
const nearCheck = (a, w, p) => {
  const t = target(w, p);
  if (!t || t === a) return 'Personne ici';
  if (!canReach(a, t)) return hasPhone(a) ? 'Trop loin (et vous ne vous connaissez pas assez pour appeler)' : 'Trop loin';
  if (t.doing === 'sleep' || t.doing === 'sleep_rough') return 'Cette personne dort';
  return true;
};
const homeCheck = (w, p) => {
  const b = w.building(p.building);
  return b && b.type === 'home' ? b : null;
};

export const ACTIONS = {
  goto: { icon: '🚶', label: 'Marcher' },
  stay: { icon: '🙂', label: 'Sur place' },

  enter: {
    icon: '🚪', label: 'Entrer', place: { param: 'building' }, stay: true,
    can: (a, w, p) => {
      const b = w.building(p.building);
      if (!b) return 'Lieu inconnu';
      if (b.type === 'home' && b.id !== a.home) return 'Ce n’est pas chez toi';
      if (a.inside === b.id) return 'Tu es déjà ici';
      return true;
    },
  },

  leave: {
    icon: '🚪', label: 'Sortir', instant: true,
    can: a => (a.inside == null ? 'Tu es déjà dehors' : true),
    effect: (a, w) => { w.cancel(a, true); },
  },

  // ---------- Travail ----------
  work: {
    icon: '💼', label: 'Travailler', place: { own: 'job' }, skip: 6,
    can: (a, w) => {
      if (!a.job) return 'Pas d’emploi';
      if (a.job.street) return 'Ton travail se fait dans la rue';
      const s = shiftNow(a.job, w);
      if (!s) return `Hors horaires (${fmtShift(a.job)})`;
      if (w.minutes > s.end - 15) return 'Ta journée est finie';
      if (a.energy < 8) return 'Trop épuisé pour travailler';
      return true;
    },
    durationFor: (a, w) => { const s = a.job && shiftNow(a.job, w); return s ? Math.max(15, s.end - w.minutes) : 15; },
    onStart: (a, w) => { const log = todayLog(a.job, w.day); if (log.arrived == null) log.arrived = w.minutes; },
    tick: (a, w, dt) => {
      if (!a.job) return;
      a.energy -= 0.03 * dt;
      if (w.minutes < shiftOf(a.job, w.day).start) return; // en avance : pas encore payé
      todayLog(a.job, w.day).worked += dt;
      const net = incomeTax(w, a, a.job.wage / 60 * dt); // salaire net (impôt prélevé à la source)
      a.current.earned = (a.current.earned || 0) + net;
    },
    effect: a => (a.current && a.current.earned ? `Service fini : +${Math.round(a.current.earned)} € net` : null),
  },

  overtime: {
    icon: '⏳', label: 'Heures sup (+25 %)', place: { own: 'job' }, duration: 120, skip: 6,
    can: a => (a.job ? true : 'Pas d’emploi'),
    tick: (a, w, dt) => {
      a.energy -= 0.04 * dt;
      const net = a.job ? incomeTax(w, a, a.job.wage * 1.25 / 60 * dt) : 0;
      a.current.earned = (a.current.earned || 0) + net;
    },
    effect: a => (a.current && a.current.earned ? `Heures sup : +${Math.round(a.current.earned)} €` : null),
  },

  call_sick: {
    icon: '🤒', label: 'Se déclarer malade', instant: true,
    can: (a, w) => {
      if (!a.job) return 'Pas d’emploi';
      if (!isWorkday(a.job, w.day)) return 'Tu ne travailles pas aujourd’hui';
      if (a.job.sick >= 2) return 'Plus de jours de maladie';
      if (todayLog(a.job, w.day).excused) return 'Déjà excusé aujourd’hui';
      return true;
    },
    effect: (a, w) => { todayLog(a.job, w.day).excused = true; a.job.sick++; return 'Journée excusée (sans salaire)'; },
  },

  quit_job: {
    icon: '🚪', label: 'Démissionner', instant: true,
    can: a => (a.job ? true : 'Pas d’emploi'),
    effect: a => { a.job = null; return 'Tu as quitté ton emploi'; },
  },

  apply: {
    icon: '📝', label: 'Postuler', place: { param: 'building' }, duration: 30,
    can: (a, w, p) => {
      const b = w.building(p.building);
      if (!b || !b.jobs) return 'On ne recrute pas ici';
      if (a.job && a.job.building === b.id) return 'Tu y travailles déjà';
      if (openings(w, b) === 0) return 'Aucun poste libre';
      if (a.lastApply[b.id] === w.day) return 'Déjà postulé aujourd’hui';
      return true;
    },
    effect: (a, w, p) => {
      const b = w.building(p.building);
      a.lastApply[b.id] = w.day;
      if (openings(w, b) === 0) return 'Le poste vient d’être pris…';
      const friendInside = w.actors.some(o => o.job && o.job.building === b.id && rel(a, o) >= 30);
      const manager = w.actors.find(o => o.role === 'manager' && o.job && o.job.building === b.id);
      let chance = 0.5 + a.karma * 0.04;
      if (friendInside) chance += 0.2;                                   // piston
      if (a.referrals[b.id]) chance += 0.2;                              // recommandé par quelqu'un
      if (manager) chance += (rel(a, manager) - 10) / 200;               // le responsable te connaît ?
      if (a.firedDay != null && w.day - a.firedDay < 7) chance -= 0.3;   // renvoi récent
      if (a.energy < 30) chance -= 0.15;
      chance += ((a.mood ?? 70) - 50) / 250;                             // le moral se voit en entretien
      if (a.hunger > 80) chance -= 0.1;
      const who = manager ? `Entretien avec ${manager.name} : ` : '';
      if (Math.random() > Math.max(0.05, Math.min(0.95, chance))) return `${who}refusé… Réessaie un autre jour.`;
      const colleagues = w.actors.filter(o => o.job && o.job.building === b.id).length;
      a.job = makeJob(b, b.jobs.wage, w.day, colleagues % 2 === 1); // équipe du matin ou du soir
      w.emit('hired', { actor: a, building: b, wage: b.jobs.wage });
      return `${who}embauché·e !`;
    },
  },

  // ---------- Manger, dormir ----------
  coffee: {
    icon: '☕', label: 'Un café', place: { type: 'cafe' }, duration: 10, cost: 2.5, seller: true,
    effect: a => { a.energy += 15; a.mood += 2; },
  },

  eat_cafe: {
    icon: '🍽️', label: 'Déjeuner', place: { type: 'cafe' }, duration: 40, cost: 12, seller: true,
    effect: (a, w, p) => {
      a.hunger -= 45; a.energy += 5; a.mood += 5;
      const t = p && p.with && w.actorById(p.with);
      if (t) { addRel(a, t, 8); a.mood += 6; t.mood += 6; return `Bon moment avec ${t.name} · ❤ +8`; }
      return null;
    },
  },

  eat_bakery: {
    icon: '🥐', label: 'Sandwich', place: { type: 'bakery' }, duration: 10, cost: 4, seller: true,
    effect: a => { a.hunger -= 25; },
  },

  groceries: {
    icon: '🛒', label: 'Courses (4 repas)', place: { type: 'shop' }, duration: 20, cost: 20, seller: true,
    can: a => (a.home == null ? 'Pas de cuisine sans logement' : true),
    effect: a => { a.food += 4; },
  },

  scratch: {
    icon: '🎟️', label: 'Ticket à gratter', place: { type: 'shop' }, duration: 2, cost: 3, seller: true,
    effect: a => {
      const r = Math.random();
      if (r < 0.02) { a.money += 200; return 'Jackpot ! +200 €'; }
      if (r < 0.15) { a.money += 30; return 'Gagné ! +30 €'; }
      return 'Perdu…';
    },
  },

  eat_home: {
    icon: '🍝', label: 'Cuisiner', place: { own: 'home' }, duration: 25,
    can: a => (a.food > 0 ? true : 'Frigo vide'),
    effect: a => { a.food -= 1; a.hunger -= 40; },
  },

  sleep: {
    icon: '😴', label: 'Dormir', place: { own: 'home' }, duration: 480, skip: 16,
    // Le réveil sonne à temps pour le prochain service
    durationFor: (a, w) => {
      const n = a.job && nextShift(a.job, w);
      return n ? Math.max(90, Math.min(480, n.start - 75 - w.minutes)) : 480;
    },
    can: a => (a.energy < 90 ? true : 'Pas sommeil'),
    tick: (a, w, dt) => { a.energy += 0.2 * dt; },
  },

  nap: {
    icon: '🛋️', label: 'Sieste', place: { own: 'home' }, duration: 60, skip: 12,
    effect: a => { a.energy += 20; a.mood += 3; },
  },

  // ---------- Loisirs ----------
  watch_tv: {
    icon: '📺', label: 'Regarder la télé', place: { own: 'home' }, duration: 60, skip: 8,
    effect: a => { a.mood += 12; a.energy += 4; return 'Un bon film, ça détend.'; },
  },

  read_book: {
    icon: '📖', label: 'Lire un livre', place: { own: 'home' }, duration: 45, skip: 8,
    effect: a => { a.mood += 9; a.karma += 0.5; return 'Quel bon roman !'; },
  },

  sit_bench: {
    icon: '🪑', label: 'S’asseoir sur le banc', here: true, duration: 20, skip: 4,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: a => { a.energy += 5; a.mood += 6; return 'Un moment de calme au soleil.'; },
  },

  feed_pigeons: {
    icon: '🐦', label: 'Nourrir les pigeons', instant: true, cost: 1,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: a => { a.mood += 4; a.karma += 0.5; return 'Les pigeons se régalent !'; },
  },

  wish_fountain: {
    icon: '🪙', label: 'Faire un vœu (1 €)', instant: true, cost: 1,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: a => {
      a.mood += 3;
      if (Math.random() < 0.05) { a.money += 20; return '✨ Ton vœu est exaucé : +20 € trouvés par terre !'; }
      return 'Plouf ! On verra si le vœu se réalise…';
    },
  },

  sleep_rough: {
    icon: '🥶', label: 'Dormir au métro', place: { type: 'metro' }, duration: 360, skip: 16,
    can: a => (a.home != null ? 'Tu as un logement' : a.energy >= 90 ? 'Pas sommeil' : true),
    tick: (a, w, dt) => { a.energy += 0.12 * dt; },
    effect: a => { a.hunger += 5; return 'Nuit difficile…'; },
  },

  metro: {
    icon: '🚇', label: 'Voyager', place: { type: 'metro' }, duration: 30,
    can: () => 'Bientôt : d’autres quartiers',
  },

  // ---------- Logement ----------
  pay_rent: {
    icon: '🧾', label: 'Payer le loyer', instant: true, cost: a => a.rentDue,
    can: a => (a.housing !== 'rent' ? 'Tu n’es pas locataire' : a.rentDue <= 0 ? 'Rien à payer' : true),
    effect: a => { a.rentDue = 0; a.rentLate = 0; return 'Loyer payé'; },
  },

  rent_home: {
    icon: '🔑', label: 'Louer (1re semaine)', instant: true,
    cost: (a, w, p) => { const b = homeCheck(w, p); return b ? weeklyRent(b) : 0; },
    can: (a, w, p) => {
      const b = homeCheck(w, p);
      if (!b) return 'Pas un logement';
      if (a.home === b.id) return 'Tu habites déjà ici';
      if (occupants(w, b).length) return 'Déjà occupé';
      if (a.rentDue > 0) return 'Paie d’abord ton loyer actuel';
      return true;
    },
    effect: (a, w, p) => { a.home = p.building; a.housing = 'rent'; a.rentDue = 0; a.rentLate = 0; return 'Bienvenue chez toi !'; },
  },

  buy_home: {
    icon: '🏡', label: 'Acheter', instant: true,
    cost: (a, w, p) => { const b = homeCheck(w, p); return b ? b.price : 0; },
    can: (a, w, p) => {
      const b = homeCheck(w, p);
      if (!b) return 'Pas un logement';
      if (a.home === b.id && a.housing === 'own') return 'C’est déjà à toi';
      if (a.home !== b.id && occupants(w, b).length) return 'Déjà occupé';
      if (a.rentDue > 0) return 'Paie d’abord ton loyer';
      return true;
    },
    effect: (a, w, p) => { a.home = p.building; a.housing = 'own'; a.rentDue = 0; a.rentLate = 0; return 'Propriétaire ! Plus de loyer.'; },
  },

  // ---------- Relations ----------
  talk: {
    icon: '💬', label: 'Discuter', here: true, duration: 15, skip: 3,
    can: nearCheck,
    // L'autre s'arrête pour répondre (s'il est disponible et à côté)
    onStart: (a, w, p) => {
      const t = target(w, p);
      if (t && near(a, t) && canPause(t, w)) w.perform(t, 'listen', { who: a.id, minutes: 15 });
    },
    effect: (a, w, p) => {
      const t = target(w, p);
      if (!t) return null;
      addRel(a, t, t.doing === 'work' ? 3 : 6);
      a.mood += 4; t.mood += 3;
      return reply(w, t, a);
    },
  },

  // S'arrêter pour écouter / répondre à quelqu'un (pendant une discussion)
  listen: {
    icon: '💬', label: 'Discute', here: true, skip: 1,
    durationFor: (a, w, p) => p.minutes || 15,
    onStart: (a, w, p) => {
      const t = target(w, p);
      const d = (t.px - t.py) - (a.px - a.py); // on se tourne l'un vers l'autre
      if (Math.abs(d) > 0.05) { a.facing = d > 0 ? 1 : -1; t.facing = -a.facing; }
      a.bubbleIn = 1.8; // répond un peu après
    },
    can: (a, w, p) => {
      const t = target(w, p);
      if (!t || t === a) return 'Personne';
      if (t.inside !== a.inside) return 'Pas au même endroit';
      return true;
    },
  },

  treat: {
    icon: '☕', label: 'Offrir un café', here: true, duration: 10, cost: 5, skip: 3,
    can: (a, w, p) => {
      const c = nearCheck(a, w, p);
      if (c !== true) return c;
      return a.inside != null && w.building(a.inside).type === 'cafe' ? true : 'Seulement dans un café';
    },
    effect: (a, w, p) => {
      const t = target(w, p);
      addRel(a, t, 12); a.energy += 10; t.energy += 10;
      return `${t.name} : « Merci, c’est gentil ! »`;
    },
  },

  ask_tip: {
    icon: '💡', label: 'Demander un tuyau', here: true, duration: 5, skip: 3,
    can: (a, w, p) => {
      const c = nearCheck(a, w, p);
      if (c !== true) return c;
      return rel(a, target(w, p)) >= 10 ? true : 'Faites d’abord connaissance';
    },
    effect: (a, w, p) => { const t = target(w, p); addRel(a, t, 1); return jobTip(w, a, t); },
  },

  wave: {
    icon: '👋', label: 'Saluer', instant: true, can: nearCheck,
    effect: (a, w, p) => { const t = target(w, p); addRel(a, t, 2); return `${t.name} te rend ton salut · ❤ +2`; },
  },

  joke: {
    icon: '😂', label: 'Plaisanter', here: true, duration: 5, skip: 2,
    can: (a, w, p) => { const c = nearCheck(a, w, p); return c !== true ? c : rel(a, target(w, p)) >= 10 ? true : 'Faites d’abord connaissance'; },
    effect: (a, w, p) => {
      const t = target(w, p);
      // ça marche mieux si l'autre a bon moral
      if (Math.random() < 0.45 + t.mood / 200) { addRel(a, t, 5); a.mood += 4; t.mood += 4; return `😂 ${t.name} éclate de rire · ❤ +5`; }
      addRel(a, t, -2); return `😐 ${t.name} ne trouve pas ça drôle… · ❤ -2`;
    },
  },

  gift: {
    icon: '🎁', label: 'Offrir un cadeau', instant: true,
    can: (a, w, p) => {
      const c = nearCheck(a, w, p);
      if (c !== true) return c;
      return Object.values(a.gifts).some(n => n > 0) ? true : 'Achète d’abord un cadeau (supérette)';
    },
    effect: (a, w, p) => {
      const t = target(w, p);
      const id = ['fleurs', 'chocolats'].find(g => a.gifts[g] > 0);
      const it = itemById(id);
      a.gifts[id]--;
      const gain = it.gift;
      addRel(a, t, gain); t.mood += 10; a.mood += 5;
      return `${it.icon} ${t.name} est ravi·e de ton cadeau ! · ❤ +${gain}`;
    },
  },

  stroll: {
    icon: '🌳', label: 'Se promener ensemble', here: true, duration: 30, skip: 4,
    can: (a, w, p) => {
      const t = target(w, p);
      if (!t) return 'Personne';
      if (!a.outdoors || !t.outdoors || !near(a, t)) return 'À faire dehors, ensemble';
      if (rel(a, t) < 20) return 'Vous n’êtes pas assez proches';
      if (!canPause(t, w)) return `${t.name} n’est pas disponible`;
      return true;
    },
    onStart: (a, w, p) => { const t = target(w, p); w.perform(t, 'listen', { who: a.id, minutes: 30 }); },
    effect: (a, w, p) => { const t = target(w, p); addRel(a, t, 8); a.mood += 10; t.mood += 8; return `🌳 Belle balade avec ${t.name} · ❤ +8`; },
  },

  // ---------- Petites actions de rue ----------
  tip: { icon: '🎵', label: 'Donner 2 €', instant: true, cost: 2, effect: a => { a.karma += 1; } },

  return_wallet: {
    icon: '👮', label: 'Le rapporter', instant: true,
    effect: a => { a.karma += 3; a.energy -= 5; return 'Merci, citoyen !'; },
  },

  keep_wallet: {
    icon: '🤫', label: 'Garder l’argent', instant: true,
    effect: (a, w) => {
      a.money += 40; a.karma -= 3;
      // Pas de chance si la police patrouille juste à côté
      const cop = w.actors.find(o => o.role === 'police' && o.outdoors && Math.hypot(o.px - a.px, o.py - a.py) < 4);
      if (cop) w.emit('caught', { actor: a, cop });
    },
  },

  pay_fine: {
    icon: '👮', label: 'Payer l’amende (90 €)', instant: true, cost: 90,
    effect: a => { a.karma -= 1; return 'Amende payée'; },
  },

  // ---------- Boutiques ----------
  buy: {
    icon: '🛍️', label: 'Acheter', instant: true, seller: true,
    cost: (a, w, p) => (itemById(p.item) ? itemById(p.item).price : 0),
    can: (a, w, p) => {
      const it = itemById(p.item);
      if (!it) return 'Article inconnu';
      if (!it.consumable && a.owned.includes(it.id)) return 'Déjà acheté';
      if (a.inside == null || w.building(a.inside).type !== it.shop) return 'À acheter en boutique';
      if (!sellerAt(w, w.building(a.inside), a)) return 'Personne à la caisse (fermé)';
      return true;
    },
    effect: (a, w, p) => {
      const it = itemById(p.item);
      if (it.consumable) { a.gifts[it.id] = (a.gifts[it.id] || 0) + 1; return `${it.icon} ${it.name} dans ton sac (${a.gifts[it.id]})`; }
      a.owned.push(it.id);
      if (it.look) { a.look = { ...a.look, ...it.look }; a.texKey = `char_${a.id}_${Date.now()}`; w.emit('lookChanged', { actor: a }); }
      if (it.vehicle) a.vehicle = it.id;
      return `${it.icon} ${it.name} : à toi !`;
    },
  },

  use_vehicle: {
    icon: '🚲', label: 'Choisir son véhicule', instant: true,
    can: (a, w, p) => (p.item && !a.owned.includes(p.item) ? 'Tu ne l’as pas' : a.vehicle === (p.item || null) ? 'Déjà choisi' : true),
    effect: (a, w, p) => { a.vehicle = p.item || null; return p.item ? `${itemById(p.item).icon} En selle !` : '🚶 À pied'; },
  },

  // ---------- Ce que les PNJ peuvent faire pour toi (pendant une conversation) ----------
  lend: {
    icon: '💶', label: 'Prêter de l’argent', instant: true,
    can: (a, w, p) => {
      const t = target(w, p);
      if (!t || !canReach(a, t)) return 'Trop loin';
      if (!(p.amount > 0) || p.amount > 100 || p.amount > a.money / 3) return 'Somme impossible';
      return true;
    },
    effect: (a, w, p) => { const t = target(w, p); a.money -= p.amount; t.money += p.amount; addRel(a, t, 3); return `${a.name} te prête ${p.amount} €`; },
  },

  recommend: {
    icon: '🤝', label: 'Recommander', instant: true,
    can: (a, w, p) => (!a.job || a.job.street ? 'Pas d’employeur' : rel(a, target(w, p) || a) < 20 ? 'Pas assez proches' : true),
    effect: (a, w, p) => { const t = target(w, p); t.referrals[a.job.building] = a.id; return `${a.name} te recommande chez ${w.building(a.job.building).name}`; },
  },

  buy_umbrella: {
    icon: '☂️', label: 'Acheter un parapluie', instant: true, cost: 12,
    can: a => (a.items.umbrella ? 'Tu en as déjà un' : true),
    effect: a => { a.items.umbrella = true; },
  },
};

// Petit texte « prochain service » réutilisé par l'UI et les événements
export function nextShiftText(a, w) {
  if (!a.job) return '';
  const n = nextShift(a.job, w);
  if (!n) return '';
  const when = n.day === w.day ? 'aujourd’hui' : n.day === w.day + 1 ? 'demain' : DAY_NAMES[weekdayOf(n.day)].toLowerCase();
  return `${when} à ${a.job.start}h`;
}
