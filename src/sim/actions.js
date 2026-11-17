import { shiftNow, shiftOf, todayLog, isWorkday, fmtShift, openings, makeJob, nextShift, DAY_NAMES, weekdayOf, sellerAt, incomeTax, roleTitle, POSITIONS, CERTS, positionsOf, posOf, freeSlots, qualifies, bestPosition } from './jobs.js';
import { weeklyRent, occupants } from './housing.js';
import { addRel, near, rel, reply, tip as jobTip, canPause } from './social.js';
import { itemById, hasPhone } from './catalog.js';
import { isClosed, freeUnits } from './city.js';
import { AID_EVERY, CAMPAIGN_FEE, TAX_POLICIES, AID_POLICIES, PROJECTS } from './gov.js';
import { TUTORIAL, TUT_REWARD, TUT_FINAL, DREAMS, tutReady, dreamDone, dailyFor, dailyDone, DAILY_REWARD, DAILY_BONUS, levelOf, LEVEL_TITLES, XP } from './goals.js';
import { isPolice, prisonRelease } from './safety.js';
import { isLawyer, LAWYER_FEE } from './justice.js';
import { LOAN_STEP, LOAN_MAX, LOAN_RATE } from './bank.js';
import { debit, isPublicJob } from './budget.js';

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

// Petites descriptions des meubles (action « Regarder »)
export const ITEM_FLAVOR = {
  safe: 'Le coffre-fort. Il paraît qu’il est inviolable.', glasscounter: 'Le guichet, derrière sa vitre.', atm: 'Le distributeur de billets.',
  judgebench: 'L’estrade du juge, et son marteau.', bar: 'La barre, où l’on témoigne.', bin: 'Une poubelle bien vidée.',
  desk: 'Un bureau bien rangé… presque.', chair: 'Une chaise solide.', stool: 'Un tabouret un peu bancal.',
  plant: 'Une plante verte qui aimerait un peu d’eau.', bigplant: 'Une grande plante, fière de ses feuilles.',
  meeting: 'La grande table des réunions interminables.', counter: 'Le comptoir, bien astiqué.', coffee: 'Ça sent bon le café.',
  register: 'La caisse enregistreuse fait « ding ».', urne: 'L’urne transparente des élections.', flagstand: 'Bleu, blanc, rouge.',
  bust: 'Le buste de Marianne, symbole de la République.', reception: 'L’accueil, avec son petit bouquet.', sofa: 'Un canapé moelleux.',
  tablec: 'Une petite table ronde.', vending: 'Un distributeur plein de friandises.', cooler: 'Une fontaine à eau qui glougloute.',
  printer: 'L’imprimante… encore en panne de papier.', bossdesk: 'Le grand bureau de la direction.', armchair: 'Un fauteuil confortable.',
  bookshelf: 'Des livres de toutes les couleurs.', bed: 'Un lit bien fait.', nightstand: 'Une table de nuit et sa petite lampe.',
  tvstand: 'La télé.', fridge: 'Le frigo ronronne.', kitchen: 'La cuisine.', tableh: 'La table de la maison.',
  breadshelf: 'Baguettes, pains de campagne, croissants…', display: 'Une vitrine qui donne faim.', oven: 'Le four est brûlant !',
  worktable: 'Le plan de travail, plein de farine.', sacks: 'Des sacs de farine de 25 kg.', bench: 'Un banc en bois.',
  shelf: 'Un rayon bien achalandé.', fridgeglass: 'Boissons fraîches et produits laitiers.', rack: 'Un portant de vêtements à la mode.',
  foldtable: 'Des pulls pliés au carré.', fitting: 'La cabine d’essayage.', carshow: 'Un véhicule rutilant.',
  tires: 'Une pile de pneus.', workbench: 'L’établi et ses outils.', bike: 'Un joli vélo.', cakes: 'Des gâteaux appétissants.',
  stairs_up: 'L’escalier vers l’étage.',
};
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
      if (isClosed(w, b.id)) return 'Fermé (le local cherche un repreneur)';
      if (w.safety && w.safety.burning(b.id)) return '🔥 Le bâtiment est en feu !';
      if (a.inside === b.id) return 'Tu es déjà ici';
      // Commerces et guichets : porte close quand personne n'est en service (sauf pour ceux qui y travaillent)
      if (OPEN_HOURS_TYPES.has(b.type) && !(a.job && a.job.building === b.id) && !sellerAt(w, b, a)) return 'Fermé : personne en service';
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
      if (isClosed(w, b.id)) return 'Local fermé';
      if (a.jailUntil && w.minutes < a.jailUntil) return 'Impossible depuis la prison';
      if (POSITIONS[b.type]) {
        // Postes : celui demandé (params.pos), sinon le mieux payé auquel on a droit
        const list = positionsOf(b);
        const want = p.pos ? list.find(x => x.id === p.pos) : bestPosition(w, a, b);
        const mine = a.job && a.job.building === b.id ? posOf(w, a.job) : null;
        if (!want) {
          if (openings(w, b) === 0) return mine ? 'Tu y travailles déjà' : 'Aucun poste libre';
          const open = list.filter(x => freeSlots(w, b, x.id) > 0 && (!mine || x.wage > a.job.wage));
          if (!open.length) return mine ? 'Pas de poste plus élevé libre pour l’instant' : 'Aucun poste libre';
          return qualifies(w, a, b, open[0]);
        }
        if (mine && mine.id === want.id) return 'Tu occupes déjà ce poste';
        if (mine && want.wage <= a.job.wage) return 'Ce poste n’est pas une promotion';
        if (freeSlots(w, b, want.id) === 0) return 'Ce poste est déjà pris';
        const q = qualifies(w, a, b, want); if (q !== true) return q;
      } else {
        const edu = (b.jobs.edu || 0);
        if (edu > (a.education ?? 1)) return `Diplôme requis : niveau ${edu} (cours du soir à l’école)`;
        if (a.job && a.job.building === b.id) return 'Tu y travailles déjà';
        if (openings(w, b) === 0) return 'Aucun poste libre';
      }
      if (a.lastApply[b.id] === w.day) return 'Déjà postulé aujourd’hui';
      // Il faut quelqu'un pour te recevoir ; un lieu sans aucune équipe : le gérant reçoit en journée (9h–18h)
      const hasStaff = w.actors.some(o => o !== a && o.job && o.job.building === b.id);
      const promotion = a.job && a.job.building === b.id;
      if (OPEN_HOURS_TYPES.has(b.type) && !promotion && (hasStaff ? !sellerAt(w, b, a) : w.hour < 9 || w.hour >= 18)) return 'Personne pour te recevoir : reviens aux heures d’ouverture';
      return true;
    },
    effect: (a, w, p) => {
      const b = w.building(p.building);
      a.lastApply[b.id] = w.day;
      if (openings(w, b) === 0) return 'Le poste vient d’être pris…';
      const pos = POSITIONS[b.type] ? (p.pos ? positionsOf(b).find(x => x.id === p.pos) : bestPosition(w, a, b)) : null;
      if (POSITIONS[b.type] && (!pos || freeSlots(w, b, pos.id) === 0)) return 'Le poste vient d’être pris…';
      // Promotion sur place : l'ancienneté et un dossier sans avertissement comptent beaucoup
      if (pos && a.job && a.job.building === b.id) {
        let ch = 0.45 + (a.job.warnings ? -0.25 : 0.2) + Math.min(0.2, (a.job.streak || 0) / 50) + a.karma * 0.03;
        if (Math.random() > Math.max(0.1, Math.min(0.95, ch))) return 'Promotion refusée pour cette fois… Continue sans faute et redemande plus tard.';
        a.job.pos = pos.id; a.job.title = pos.title;
        a.job.wage = Math.max(a.job.wage, pos.wage); a.job.baseWage = pos.wage;
        w.emit('promoted', { actor: a, building: b, title: pos.title, wage: a.job.wage });
        return `🎉 Promotion : ${pos.title} (${a.job.wage} €/h) !`;
      }
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
      const wage = pos ? pos.wage + (w.economy ? w.economy.wageBonus(b.id) : 0) : b.jobs.wage;
      a.job = makeJob(b, wage, w.day, colleagues % 2 === 1, (colleagues * 2) % 7); // équipe du matin ou du soir, jours décalés
      if (pos) { a.job.pos = pos.id; a.job.title = pos.title; }
      else { const rt = roleTitle(b.type, colleagues); if (rt) a.job.title = rt; }
      a.job.startDay = w.day + 1; // pas de service le jour de l'embauche : on commence demain au plus tôt
      w.emit('hired', { actor: a, building: b, wage });
      return `${who}embauché·e${pos ? ` : ${pos.title}, ${wage} €/h` : ''} !`;
    },
  },

  // Nouvel emploi : reporter le premier service au lundi suivant (le temps de s'installer)
  job_start_monday: {
    icon: '📅', label: 'Commencer lundi prochain', instant: true, custom: true,
    can: (a, w) => (!a.job || a.job.street ? 'Pas de nouvel emploi' : (a.job.startDay || 0) <= w.day ? 'Tu as déjà commencé' : true),
    effect: (a, w) => {
      let d = w.day + 1;
      while (weekdayOf(d) !== 0) d++;
      a.job.startDay = d;
      return `Premier service lundi (jour ${d}).`;
    },
  },

  // ---------- Manger, dormir ----------
  coffee: {
    icon: '☕', label: 'Un café', place: { type: 'cafe' }, duration: 10, cost: 2.5, seller: true,
    effect: a => { a.energy += 15; a.mood += 2; },
  },

  eat_cafe: {
    icon: '🍽️', label: 'Déjeuner', place: { type: 'cafe' }, duration: 40, cost: 12, seller: true,
    can: a => (a.hunger < 15 ? 'Tu n’as pas faim' : true),
    effect: (a, w, p) => {
      a.hunger -= 45; a.energy += 5; a.mood += 7; // (plat du jour : un peu plus de plaisir)
      const t = p && p.with && w.actorById(p.with);
      if (t) { addRel(a, t, 8); a.mood += 6; t.mood += 6; return `Bon moment avec ${t.name} · ❤ +8`; }
      return null;
    },
  },

  eat_bakery: {
    icon: '🥐', label: 'Sandwich', place: { type: 'bakery' }, duration: 10, cost: 4, seller: true,
    can: a => (a.hunger < 10 ? 'Tu n’as pas faim' : true),
    effect: a => { a.hunger -= 25; },
  },

  groceries: {
    icon: '🛒', label: 'Courses (4 repas)', place: { type: 'shop' }, duration: 20, cost: 20, seller: true,
    can: a => (a.home == null ? 'Pas de cuisine sans logement' : a.food >= 8 ? 'Ton frigo est plein' : true),
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
    can: a => (a.food <= 0 ? 'Frigo vide' : a.hunger < 15 ? 'Tu n’as pas faim' : true),
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
    can: a => (a.energy > 85 ? 'Tu es en pleine forme' : true),
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

  feed_ducks: {
    icon: '🦆', label: 'Nourrir les canards', instant: true, cost: 1,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: a => { a.mood += 5; return 'Les canards accourent en cancanant !'; },
  },

  play_swing: {
    icon: '🎠', label: 'Faire de la balançoire', here: true, duration: 15, skip: 4,
    can: a => (!a.outdoors ? 'Seulement dehors' : a.energy < 10 ? 'Trop fatigué·e' : true),
    effect: a => { a.mood += 8; a.energy -= 2; return 'Comme quand tu étais petit·e !'; },
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
      if (freeUnits(w, b) <= 0) return 'Complet : aucun appartement libre';
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

  // ---------- L'État : mairie, aides, élections ----------
  allocation: {
    icon: '💶', label: 'Demander l’aide sociale', place: { type: 'cityhall' }, duration: 20, seller: true,
    can: (a, w) => {
      if (!w.gov) return 'Pas de mairie';
      if (a.job && !a.job.street) return 'Réservée aux personnes sans emploi';
      if (a.money >= 300) return 'Tu as assez pour vivre (moins de 300 € requis)';
      if (a.aidDay != null && w.day - a.aidDay < AID_EVERY) return `Déjà aidé·e cette semaine (encore ${AID_EVERY - (w.day - a.aidDay)} j)`;
      if ((w.treasury || 0) < w.gov.aidAmount) return 'Les caisses de la ville sont vides';
      return true;
    },
    effect: (a, w) => {
      const n = w.gov.aidAmount;
      if ((w.treasury || 0) < n) return 'Les caisses de la ville sont vides…';
      debit(w, 'aid', n); a.money += n; a.aidDay = w.day; a.mood += 4;
      w.gov.aidPaid += n;
      return `Aide sociale accordée : +${n} €`;
    },
  },

  vote: {
    icon: '🗳️', label: 'Voter', place: { type: 'cityhall' }, duration: 10, seller: true, custom: true,
    can: (a, w, p) => {
      const g = w.gov;
      if (!g || !g.votingOpen) return 'Pas d’élection en ce moment';
      if (g.votes[a.id]) return 'Tu as déjà voté';
      if (!p || !g.candidates.includes(p.for)) return 'Choisis un candidat';
      return true;
    },
    effect: (a, w, p) => {
      w.gov.votes[a.id] = p.for; a.mood += 2; a.karma += 0.5;
      const c = w.actorById(p.for);
      return `A voté${c ? ` pour ${c.name}` : ''} !`;
    },
  },

  run_mayor: {
    icon: '📣', label: 'Se présenter à la mairie', place: { type: 'cityhall' }, duration: 15, seller: true, cost: CAMPAIGN_FEE, custom: true,
    can: (a, w) => {
      const g = w.gov;
      if (!g || !g.campaignOpen) return 'Les candidatures ouvrent 5 jours avant les élections';
      if (g.candidates.includes(a.id)) return 'Tu es déjà candidat·e';
      if (g.votingOpen && Object.keys(g.votes).length) return 'Trop tard : le vote a commencé';
      if (a.home == null) return 'Il faut une adresse dans le quartier';
      return true;
    },
    effect: (a, w) => {
      w.gov.candidates.push(a.id);
      w.gov.post('📣', `${a.name} se présente aux élections municipales.`);
      return 'Candidature déposée ! Fais-toi des amis : on vote pour ceux qu’on apprécie.';
    },
  },

  set_policy: {
    icon: '📜', label: 'Changer la politique', instant: true, custom: true,
    can: (a, w, p) => {
      const g = w.gov;
      if (!g || g.mayor !== a.id) return 'Seul le maire décide';
      if (a.inside == null || w.building(a.inside).type !== 'cityhall') return 'Cela se décide à la mairie';
      if (!p || !((p.tax && TAX_POLICIES[p.tax]) || (p.aid && AID_POLICIES[p.aid]))) return 'Choix inconnu';
      if ((p.tax && g.tax === p.tax) || (p.aid && g.aid === p.aid)) return 'C’est déjà la politique en place';
      return true;
    },
    effect: (a, w, p) => {
      const g = w.gov;
      if (p.tax) g.tax = p.tax;
      if (p.aid) g.aid = p.aid;
      const label = p.tax ? TAX_POLICIES[p.tax].label : AID_POLICIES[p.aid].label;
      g.post('📜', `Décision du maire ${a.name} : ${label.toLowerCase()}.`);
      return `${label} : c’est voté.`;
    },
  },

  city_project: {
    icon: '🎉', label: 'Lancer un projet pour le quartier', instant: true, custom: true,
    can: (a, w, p) => {
      const g = w.gov;
      if (!g || g.mayor !== a.id) return 'Seul le maire décide';
      if (a.inside == null || w.building(a.inside).type !== 'cityhall') return 'Cela se décide à la mairie';
      const pr = p && PROJECTS[p.project];
      if (!pr) return 'Projet inconnu';
      if ((w.treasury || 0) < pr.cost) return `Pas assez dans les caisses (${pr.cost} €)`;
      if (g.lastProject != null && w.day - g.lastProject < 7) return 'Un projet par semaine au plus';
      return true;
    },
    effect: (a, w, p) => w.gov.project(p.project),
  },

  // ---------- Boutiques : se faire plaisir, entretenir son véhicule ----------
  shopping: {
    icon: '🛍️', label: 'Faire du shopping', place: { type: 'fashion' }, duration: 30, cost: 35, seller: true, skip: 4,
    effect: a => { a.mood += 8; return 'Un petit plaisir qui fait du bien.'; },
  },
  repair: {
    icon: '🔧', label: 'Réviser mon véhicule', place: { type: 'garage' }, duration: 30, cost: 30, seller: true, skip: 4,
    can: (a, w) => (!a.vehicle ? 'Pas de véhicule' : a.lastRepair != null && w.day - a.lastRepair < 7 ? 'Déjà révisé cette semaine' : true),
    effect: (a, w) => { a.lastRepair = w.day; a.mood += 3; return 'Comme neuf ! Assurance réduite de moitié lundi prochain.'; },
  },

  // ---------- Objectifs : récupérer la récompense d'une étape ou d'un rêve ----------
  claim_goal: {
    icon: '🎁', label: 'Récupérer la récompense', instant: true, custom: true,
    can: (a, w, p) => {
      if (!a.goals || !p) return 'Rien à récupérer';
      if (p.goal === 'tut') return tutReady(a) ? true : 'Étape pas encore faite';
      if (p.goal === 'daily') {
        const d = dailyFor(a, w);
        if (p.id === 'bonus') return d.picks.every(id => d.claimed[id]) && !d.bonus ? true : 'Réussis d’abord les 3 objectifs du jour';
        if (!d.picks.includes(p.id)) return 'Pas un objectif du jour';
        if (d.claimed[p.id]) return 'Déjà récupéré';
        return dailyDone(a, p.id) ? true : 'Pas encore fait';
      }
      const d = DREAMS.find(x => x.id === p.goal);
      if (!d) return 'Objectif inconnu';
      if (a.goals.claimed[d.id]) return 'Déjà récupéré';
      return dreamDone(a, w, d) ? true : 'Rêve pas encore atteint';
    },
    effect: (a, w, p) => {
      let r, label, xp = 0;
      if (p.goal === 'tut') {
        const step = TUTORIAL[a.goals.tut];
        a.goals.tut++;
        const last = a.goals.tut >= TUTORIAL.length;
        r = { money: TUT_REWARD.money + (last ? TUT_FINAL.money : 0), mood: TUT_REWARD.mood + (last ? TUT_FINAL.mood : 0) };
        label = last ? 'Premiers pas terminés ! Place aux objectifs du jour 📅' : `${step.icon} Étape réussie`;
        xp = XP.tut;
      } else if (p.goal === 'daily') {
        const d = dailyFor(a, w);
        if (p.id === 'bonus') { d.bonus = true; r = { money: DAILY_BONUS.money, mood: 6 }; xp = DAILY_BONUS.xp; label = '🏆 Journée parfaite !'; }
        else { d.claimed[p.id] = true; r = { money: DAILY_REWARD.money, mood: 2 }; xp = DAILY_REWARD.xp; label = '✅ Objectif du jour'; }
      } else {
        const d = DREAMS.find(x => x.id === p.goal);
        a.goals.claimed[d.id] = true;
        r = d.reward;
        label = `🌟 Rêve réalisé : ${d.label}`;
        xp = XP.dream;
      }
      a.money += r.money; a.mood += r.mood;
      // Niveau de vie : on monte de niveau avec l'expérience (petit cadeau à chaque niveau)
      const before = levelOf(a.goals.xp || 0);
      a.goals.xp = (a.goals.xp || 0) + xp;
      const after = levelOf(a.goals.xp);
      let up = '';
      if (after > before) { a.money += 50 * after; a.mood += 10; up = ` · ⭐ Niveau ${after + 1} : ${LEVEL_TITLES[after]} (+${50 * after} €)`; }
      return `${label}${r.money ? ` · +${r.money} €` : ''} · +${xp} XP${up}`;
    },
  },

  // ---------- Délits, police, prison ----------
  jail: {
    icon: '⛓️', label: 'En prison', skip: 16,
    // Détention digne : trois repas par jour, nuits de repos, et en journée atelier rémunéré (pécule versé à la sortie),
    // bibliothèque, sport et cours. Le moral reste stable et l'on ressort avec un petit bagage pour repartir.
    tick: (a, w, dt) => {
      const h = w.hour;
      a.hunger = Math.max(0, a.hunger - 0.12 * dt);                      // repas servis à heures fixes
      a.energy = Math.min(100, a.energy + (h >= 22 || h < 7 ? 0.16 : 0.04) * dt); // la nuit on dort, le jour on souffle
      a.mood = Math.max(35, a.mood + (a.mood < 50 ? 0.04 : -0.002) * dt); // soutien et activités : le moral ne s'effondre pas
      a.sick = false;                                                    // infirmerie
      if (h >= 9 && h < 17 && w.weekday < 5) a.prisonPay = (a.prisonPay || 0) + (4 / 60) * dt; // atelier : 4 €/h
      if (h >= 14 && h < 16) a.prisonStudy = (a.prisonStudy || 0) + dt / 120; // cours l'après-midi
    },
    effect: (a, w) => { a.jailUntil = null; return prisonRelease(w, a); },
  },
  steal: {
    icon: '🤏', label: 'Voler son portefeuille (risqué)', here: true, duration: 2, custom: true,
    can: (a, w, p) => {
      const t = target(w, p);
      if (!t || t === a) return 'Personne ici';
      if (!near(a, t)) return 'Trop loin';
      if (isPolice(t)) return 'Voler un policier ? Mauvaise idée.';
      if (t.money < 5) return 'Rien à voler';
      return true;
    },
    effect: (a, w, p) => {
      const t = target(w, p);
      if (Math.random() < 0.3) { // raté : la victime s'en rend compte
        t.victimOf = a.id; addRel(a, t, -30); a.wanted = (a.wanted || 0) + 1; a.karma -= 1;
        w.emit('crime', { actor: a, kind: 'steal', victim: t, outcome: 'seen' });
        return `${t.name} t’a vu·e ! « Au voleur ! »`;
      }
      const loot = Math.min(Math.round(t.money), 15 + Math.round(Math.random() * 45));
      t.money -= loot; a.money += loot;
      const out = w.safety.report('steal', a, t, loot);
      return out === 'arrested' ? `Pris·e la main dans le sac !` : `+${loot} €${out === 'seen' ? ' · quelqu’un t’a vu·e…' : ''}`;
    },
  },
  shoplift: {
    icon: '🫣', label: 'Voler à l’étalage (risqué)', place: { type: 'shop' }, duration: 5,
    effect: (a, w) => {
      const seller = sellerAt(w, w.building(a.inside), a);
      if (seller && Math.random() < 0.4) { a.wanted = (a.wanted || 0) + 1; a.karma -= 2; w.emit('crime', { actor: a, kind: 'shoplift', victim: null, outcome: 'seen' }); return `${seller.name} t’a vu·e : la police est prévenue !`; }
      a.food += 2;
      const out = w.safety.report('shoplift', a, null, 0);
      return out === 'arrested' ? 'Pris·e sur le fait !' : '2 repas glissés dans ton sac…';
    },
  },
  burgle: {
    icon: '🕵️', label: 'Cambrioler (la nuit, très risqué)', place: { param: 'building' }, duration: 40, custom: true, skip: 6,
    can: (a, w, p) => {
      const b = w.building(p.building);
      if (!b || b.type !== 'home') return 'Pas un logement';
      if (b.id === a.home) return 'C’est chez toi !';
      if (!(w.hour >= 23 || w.hour < 5)) return 'Seulement en pleine nuit';
      if (w.actors.some(o => o.inside === b.id && o !== a)) return 'Il y a quelqu’un…';
      if (!occupants(w, b).length) return 'Personne n’habite ici';
      return true;
    },
    effect: (a, w, p) => {
      const b = w.building(p.building);
      const victims = occupants(w, b).filter(o => o.money > 20);
      if (!victims.length) return 'Rien de valeur…';
      const v = victims[Math.floor(Math.random() * victims.length)];
      const loot = Math.min(Math.round(v.money * 0.3), 40 + Math.round(Math.random() * 110));
      v.money -= loot; a.money += loot;
      if (w.city) w.city.post('🕵️', `Cambriolage à ${b.name} cette nuit : ${v.name} s’est fait voler ${loot} €.`);
      const out = w.safety.report('burgle', a, v, loot);
      if (out !== 'arrested') w.cancel(a, true);
      return out === 'arrested' ? 'La police t’attendait…' : `+${loot} € volés chez ${v.name}`;
    },
  },
  arrest: {
    icon: '🚔', label: 'Arrêter', here: true, duration: 5, custom: true,
    can: (a, w, p) => {
      const t = target(w, p);
      if (!isPolice(a)) return 'Seule la police arrête';
      if (!t || !near(a, t)) return 'Trop loin';
      if (!(t.wanted > 0)) return 'Rien à lui reprocher';
      return true;
    },
    effect: (a, w, p) => { const t = target(w, p); w.safety.arrest(a, t); return `${t.name} est conduit·e en prison`; },
  },
  report: {
    icon: '📝', label: 'Porter plainte', place: { type: 'police' }, duration: 20,
    can: (a, w) => (!a.victimOf ? 'Tu n’as pas été volé·e (ou tu ne sais pas par qui)' : !w.actorById(a.victimOf) ? 'Le voleur a quitté le quartier' : true),
    effect: (a, w) => {
      const t = w.actorById(a.victimOf);
      t.wanted = (t.wanted || 0) + 1; a.victimOf = null;
      return `Plainte enregistrée contre ${t.name}. La police va le/la chercher.`;
    },
  },

  // ---------- Justice ----------
  hire_lawyer: {
    icon: '👩‍⚖️', label: `Engager un·e avocat·e (${LAWYER_FEE} €)`, instant: true, cost: LAWYER_FEE, custom: true,
    can: (a, w) => {
      if (!a.trial) return 'Tu n’as pas de procès';
      if (a.trial.lawyer != null) return 'Tu as déjà un·e avocat·e';
      if (!w.actors.some(o => o !== a && isLawyer(o))) return 'Aucun·e avocat·e dans le quartier';
      return true;
    },
    effect: (a, w) => {
      const list = w.actors.filter(o => o !== a && isLawyer(o));
      const l = list.sort((x, y) => ((a.relations[y.id] || 0) - (a.relations[x.id] || 0)))[0];
      l.money += LAWYER_FEE; a.trial.lawyer = l.id;
      return `${l.name} assurera ta défense au procès.`;
    },
  },
  jury_vote: {
    icon: '⚖️', label: 'Voter au procès', instant: true, custom: true,
    can: (a, w, p) => {
      const t = target(w, p);
      if (!t || !t.trial) return 'Plus de procès en cours';
      if (!t.trial.jury.includes(a.id)) return 'Tu ne fais pas partie du jury';
      if (t.trial.votes[a.id] != null) return 'Tu as déjà voté';
      return true;
    },
    effect: (a, w, p) => {
      const t = target(w, p);
      w.justice.vote(a, t, p.verdict === 'guilty');
      a.karma += 0.3;
      return p.verdict === 'guilty' ? `Ton avis : ${t.name} est coupable.` : `Ton avis : ${t.name} est innocent·e.`;
    },
  },
  // Corruption : un·e agent·e public en service accepte une enveloppe. Ça rapporte… et ça peut coûter la place et la liberté.
  take_bribe: {
    icon: '💰', label: 'Accepter un pot-de-vin', instant: true, custom: true,
    can: (a, w) => (!a.job || !isPublicJob(w, a.job) ? 'Réservé aux agents publics' : !shiftNow(a.job, w) ? 'Seulement pendant le service' : true),
    effect: (a, w) => {
      const n = Math.round(60 + Math.random() * 90);
      a.money += n; a.karma = (a.karma || 0) - 3;
      if (Math.random() < 0.3) { // quelqu'un a tout vu : enquête, renvoi, et la police te cherche
        a.wanted = (a.wanted || 0) + 1;
        if (w.city) w.city.post('🕵️', `Enquête pour corruption : ${a.name} est soupçonné·e d’avoir touché des pots-de-vin.`);
        const b = w.building(a.job.building);
        a.job = null; a.firedDay = w.day;
        w.emit('fired', { actor: a, building: b, reason: 'corruption' });
        return `+${n} €… mais quelqu’un t’a vu·e ! Renvoi et enquête.`;
      }
      return `+${n} € glissés discrètement dans ta poche.`;
    },
  },
  attend_trial: {
    icon: '🏛️', label: 'Assister à une audience', place: { type: 'court' }, duration: 45, skip: 4, seller: true,
    effect: a => { a.mood += 3; a.karma += 0.2; return 'Une audience passionnante. La justice est rendue au nom du peuple français.'; },
  },
  legal_advice: {
    icon: '📜', label: 'Conseil juridique (30 €)', place: { type: 'court' }, duration: 20, cost: 30, seller: true,
    effect: a => { a.mood += 2; if (a.rentLate) a.rentLate = Math.max(0, a.rentLate - 2); return 'Un·e avocat·e t’explique tes droits. Tu y vois plus clair.'; },
  },

  // ---------- Banque ----------
  deposit: {
    icon: '🏦', label: 'Déposer mon argent', place: { type: 'bank' }, duration: 5, seller: true,
    can: (a, w, p) => (bankAmount(a, 'deposit', p) <= 0 ? 'Rien à déposer (on garde 20 € en poche)' : true),
    effect: (a, w, p) => {
      const n = bankAmount(a, 'deposit', p);
      a.money -= n; a.bank = (a.bank || 0) + n;
      return `+${n} € sur ton compte épargne (${Math.round(a.bank)} €). À l’abri des pickpockets !`;
    },
  },
  withdraw: {
    icon: '💶', label: 'Retirer 100 €', place: { type: 'bank' }, duration: 5, seller: true,
    can: (a, w, p) => (bankAmount(a, 'withdraw', p) <= 0 ? 'Ton compte épargne est vide' : true),
    effect: (a, w, p) => {
      const n = bankAmount(a, 'withdraw', p);
      a.bank -= n; a.money += n;
      return `${n} € retirés (reste ${Math.round(a.bank)} € sur ton compte)`;
    },
  },
  take_loan: {
    icon: '📝', label: `Emprunter ${LOAN_STEP} €`, place: { type: 'bank' }, duration: 20, seller: true,
    can: a => {
      if (!a.job) return 'Il faut un emploi pour emprunter';
      if ((a.loan || 0) + LOAN_STEP > LOAN_MAX) return `Plafond atteint (${LOAN_MAX} € de prêt)`;
      if (a.rentLate > 0) return 'Paie d’abord ton loyer en retard';
      return true;
    },
    effect: a => {
      a.loan = (a.loan || 0) + LOAN_STEP; a.money += LOAN_STEP;
      return `Prêt accordé : +${LOAN_STEP} €. Remboursement automatique chaque lundi (${Math.round(LOAN_RATE * 100)} % d’intérêts par semaine).`;
    },
  },
  repay_loan: {
    icon: '✅', label: 'Rembourser mon prêt', place: { type: 'bank' }, duration: 5, seller: true,
    can: a => (!(a.loan > 0) ? 'Tu n’as pas de prêt' : a.money + (a.bank || 0) < 1 ? 'Pas assez d’argent' : true),
    effect: a => {
      const fromCash = Math.min(a.loan, Math.max(0, a.money));
      a.money -= fromCash; a.loan -= fromCash;
      const fromBank = Math.min(a.loan, Math.max(0, a.bank || 0));
      a.bank = (a.bank || 0) - fromBank; a.loan -= fromBank;
      const n = Math.round(fromCash + fromBank);
      return a.loan > 0 ? `${n} € remboursés (reste ${Math.round(a.loan)} €)` : `${n} € remboursés : prêt soldé !`;
    },
  },

  // ---------- Propreté ----------
  pick_litter: {
    icon: '🗑️', label: 'Ramasser les déchets', here: true, duration: 15, skip: 3,
    can: (a, w) => (!a.outdoors ? 'Seulement dehors' : w.city && w.city.cleanliness >= 96 ? 'Les rues sont déjà propres' : true),
    effect: (a, w) => { if (w.city) w.city.clean(3); a.mood += 2; a.karma += 0.5; return 'Les rues sont un peu plus propres. Merci !'; },
  },
  use_bin: {
    icon: '🗑️', label: 'Jeter un papier', instant: true,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: (a, w) => { if (w.city) w.city.clean(0.3); a.karma += 0.1; return 'Hop, à la poubelle.'; },
  },

  // ---------- Pompiers ----------
  extinguish: {
    icon: '🚒', label: 'Éteindre l’incendie', place: { param: 'building' }, duration: 40, skip: 6, custom: true,
    can: (a, w, p) => {
      if (!w.safety || !w.safety.burning(p.building)) return 'Pas d’incendie ici';
      if (!a.job || w.building(a.job.building).type !== 'firestation') return 'Laisse faire les pompiers !';
      return true;
    },
    effect: (a, w, p) => { w.safety.putOut(w.building(p.building), a); a.mood += 8; a.karma += 2; w.cancel(a, true); return 'Incendie maîtrisé. Bravo !'; },
  },

  // ---------- Hôpital et école ----------
  consult: {
    icon: '🩺', label: 'Consulter un médecin', place: { type: 'hospital' }, duration: 30, cost: 25, seller: true, skip: 4,
    can: a => (!a.sick && a.energy >= 35 ? 'Tu es en pleine forme' : true),
    effect: a => { const was = a.sick; a.sick = false; a.energy += 25; a.mood += 4; return was ? 'Guéri·e ! Repose-toi bien.' : 'Un bon bilan de santé.'; },
  },
  study: {
    icon: '🎓', label: 'Suivre un cours (2 h)', place: { type: 'school' }, duration: 120, cost: 20, seller: true, skip: 8,
    can: (a, w) => ((a.education ?? 1) >= 3 ? 'Tu as déjà le plus haut diplôme' : a.studyDay === w.day ? 'Un cours par jour, ça suffit' : true),
    effect: (a, w) => {
      a.studyDay = w.day; a.studies = (a.studies || 0) + 1; a.mood += 2;
      if (a.studies >= 3) { a.studies = 0; a.education = (a.education ?? 1) + 1; return `🎓 Diplôme obtenu : niveau ${a.education} ! De nouveaux métiers s’ouvrent.`; }
      return `Cours suivi (${a.studies}/3 avant le prochain diplôme)`;
    },
  },

  // Formation courte (3 h) : certificat qui ouvre des postes qualifiés (barista, CAP, secourisme, comptabilité…)
  train: {
    icon: '📜', label: 'Suivre une formation (3 h)', place: { type: 'school' }, duration: 180, seller: true, skip: 8, custom: true,
    cost: (a, w, p) => (CERTS[p && p.cert] ? CERTS[p.cert].cost : 0),
    can: (a, w, p) => {
      const c = CERTS[p && p.cert];
      if (!c) return 'Choisis une formation';
      if ((a.certs || []).includes(p.cert)) return 'Tu as déjà cette formation';
      if ((c.edu || 0) > (a.education ?? 1)) return `Diplôme requis : niveau ${c.edu}`;
      if (a.studyDay === w.day) return 'Une seule formation ou un seul cours par jour';
      return true;
    },
    effect: (a, w, p) => {
      a.certs = [...(a.certs || []), p.cert]; a.studyDay = w.day; a.mood += 2;
      return `📜 ${CERTS[p.cert].name} obtenu·e ! De nouveaux postes s’ouvrent.`;
    },
  },

  // ---------- Fêtes du quartier (sur place, quand la fête a lieu là où l'on est) ----------
  market_buy: {
    icon: '🧺', label: 'Acheter des produits frais', here: true, duration: 15, cost: 12, skip: 3,
    can: (a, w) => (!w.festivals || !w.festivals.here(a, 'marche') ? 'Seulement au marché du dimanche' : a.home == null ? 'Pas de cuisine sans logement' : true),
    effect: a => { a.food += 3; a.mood += 4; a.festDay = a.festDay || {}; return 'Panier plein de bons produits (3 repas) !'; },
  },
  crepe: {
    icon: '🥞', label: 'Une crêpe au sucre', here: true, duration: 10, cost: 4, skip: 3,
    can: (a, w) => (w.festivals && (w.festivals.here(a, 'marche') || w.festivals.here(a, 'brocante') || w.festivals.here(a, 'musique')) ? true : 'Il n’y a pas de stand de crêpes ici'),
    effect: a => { a.hunger -= 20; a.mood += 4; return 'Miam !'; },
  },
  brocante_hunt: {
    icon: '🏺', label: 'Chiner (10 €)', here: true, duration: 30, cost: 10, skip: 4,
    can: (a, w) => (w.festivals && w.festivals.here(a, 'brocante') ? true : 'Seulement pendant la brocante'),
    effect: a => {
      const r = Math.random();
      if (r < 0.12) { a.money += 60; a.mood += 8; return '💎 Un trésor ! Revendu 60 € à un collectionneur.'; }
      if (r < 0.7) { a.mood += 7; return 'Une jolie trouvaille pour ton appartement.'; }
      a.mood += 2; return 'Rien de spécial, mais une belle balade.';
    },
  },
  dance: {
    icon: '💃', label: 'Danser', here: true, duration: 30, skip: 3,
    can: (a, w) => (w.festivals && (w.festivals.here(a, 'concert') || w.festivals.here(a, 'musique')) ? (a.energy < 15 ? 'Trop fatigué·e pour danser' : true) : 'Pas de musique ici'),
    effect: (a, w) => {
      a.mood += 12; a.energy -= 6;
      const others = w.actors.filter(o => o !== a && near(a, o) && o.doing === 'dance');
      for (const o of others) addRel(a, o, 3);
      return others.length ? `Quelle ambiance ! Tu danses avec ${others.length} personne${others.length > 1 ? 's' : ''} · ❤ +3` : 'Quelle ambiance !';
    },
  },

  // ---------- Objets d'intérieur sans fonction particulière : on peut quand même s'en servir ----------
  inspect: {
    icon: '👀', label: 'Regarder', instant: true,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: (a, w, p) => ITEM_FLAVOR[p && p.what] || 'Rien de spécial… mais c’est plutôt joli.',
  },
  sit_here: {
    icon: '🪑', label: 'S’asseoir un moment', here: true, duration: 15, skip: 3,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: a => { a.energy += 3; a.mood += 2; return 'Ça fait du bien de s’asseoir.'; },
  },
  vending_snack: {
    icon: '🍫', label: 'Un en-cas au distributeur', instant: true, cost: 2,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: a => { a.hunger -= 8; a.energy += 3; return 'Clac ! Une barre chocolatée.'; },
  },
  drink_water: {
    icon: '💧', label: 'Boire un verre d’eau', instant: true,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: a => { a.energy += 2; return 'Un verre d’eau fraîche.'; },
  },
  browse_books: {
    icon: '📚', label: 'Feuilleter un livre', here: true, duration: 20, skip: 4,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: a => { a.mood += 3; return 'Quelques pages passionnantes.'; },
  },
  water_plant: {
    icon: '🪴', label: 'Arroser la plante', instant: true,
    can: a => (a.inside == null ? 'Seulement à l’intérieur' : true),
    effect: a => { a.mood += 1; a.karma += 0.1; return 'La plante a l’air contente.'; },
  },

  admire_statue: {
    icon: '🗽', label: 'Admirer la statue', here: true, duration: 10, skip: 3,
    can: a => (a.outdoors ? true : 'Seulement dehors'),
    effect: a => { a.mood += 5; a.karma += 0.2; return 'Marianne veille sur le quartier.'; },
  },
};

// Lieux qui ne se visitent qu'ouverts (quelqu'un en service à l'intérieur)
const OPEN_HOURS_TYPES = new Set(['cafe', 'bakery', 'shop', 'fashion', 'garage', 'bank', 'court', 'cityhall', 'school', 'office']);

// Montant d'une opération bancaire : params.amount (nombre ou 'all'), sinon le geste par défaut
function bankAmount(a, kind, p = {}) {
  if (kind === 'deposit') {
    const max = Math.floor(Math.max(0, a.money - 20));
    return p.amount === 'all' || p.amount == null ? max : Math.min(max, Math.floor(p.amount));
  }
  const max = Math.floor(Math.max(0, a.bank || 0));
  return p.amount === 'all' ? max : Math.min(max, Math.floor(p.amount ?? 100));
}

// Petit texte « prochain service » réutilisé par l'UI et les événements
export function nextShiftText(a, w) {
  if (!a.job) return '';
  const n = nextShift(a.job, w);
  if (!n) return '';
  const when = n.day === w.day ? 'aujourd’hui' : n.day === w.day + 1 ? 'demain' : DAY_NAMES[weekdayOf(n.day)].toLowerCase();
  return `${when} à ${a.job.start}h`;
}
