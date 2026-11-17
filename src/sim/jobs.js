// Emploi : contrats, horaires, semaine, avertissements, augmentations, renvoi.
// Mêmes règles pour le joueur et les PNJ.
import { credit, debit, isPublicJob } from './budget.js';

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const MAX_WARNINGS = 3;
export const RAISE_EVERY = 15; // jours sans faute avant une augmentation
export const RAISE_CAP = 1.3;  // salaire max = 130 % du salaire d'embauche
export const EARLY = 80;       // on peut arriver jusqu'à 1 h 20 avant son service (la marche prend du temps)

// Horaires par type de lieu (service de 8 h). days : 0 = lundi … 6 = dimanche
// alt = heure de début de l'équipe du soir (les commerces restent ouverts plus tard, comme en vrai)
export const SHIFTS = {
  office: { start: 9, hours: 8, days: [0, 1, 2, 3, 4] },
  cafe: { start: 7, alt: 14, hours: 8, days: [0, 1, 2, 3, 4, 5] },
  bakery: { start: 6, alt: 12, hours: 8, days: [1, 2, 3, 4, 5, 6] },
  shop: { start: 9, alt: 14, hours: 8, days: [0, 1, 2, 3, 4, 5] },
  fashion: { start: 10, alt: 11, hours: 8, days: [1, 2, 3, 4, 5, 6] },
  garage: { start: 8, hours: 8, days: [0, 1, 2, 3, 4] },
  cityhall: { start: 9, hours: 8, days: [0, 1, 2, 3, 4, 5] }, // mairie : ouverte du lundi au samedi
  // Services publics ouverts tous les jours : chacun travaille 5 jours (rotate), en équipes du matin et du soir
  police: { start: 6, alt: 14, hours: 8, days: [0, 1, 2, 3, 4], rotate: true },
  hospital: { start: 7, alt: 15, hours: 8, days: [0, 1, 2, 3, 4], rotate: true },
  firestation: { start: 8, alt: 16, hours: 8, days: [0, 1, 2, 3, 4], rotate: true },
  prison: { start: 7, alt: 15, hours: 8, days: [0, 1, 2, 3, 4], rotate: true },
  school: { start: 8, hours: 8, days: [0, 1, 2, 3, 4] },
  court: { start: 9, hours: 8, days: [0, 1, 2, 3, 4] },
  bank: { start: 9, hours: 8, days: [0, 1, 2, 3, 4, 5] },
};

// (ancien système : titre selon l'ordre d'embauche — gardé pour les vieilles sauvegardes)
export function roleTitle(type, rank) {
  if (type === 'court') return rank === 0 ? 'Juge' : rank === 3 ? 'Greffier·ère' : 'Avocat·e';
  if (type === 'bank') return rank === 0 ? 'Conseiller·ère bancaire' : 'Guichetier·ère';
  return null;
}

// ---------- Postes : plusieurs métiers dans un même lieu ----------
// Le premier poste de la liste est le poste d'entrée (il prend les places qui restent) ; les autres ont 1 place
// (ou `n`) et demandent : un diplôme (edu 0–3, cours du soir), une formation (cert, à l'école) ou de l'expérience
// (exp = jours travaillés dans ce métier). `pay` = écart avec le salaire de base du lieu (€/h).
export const POSITIONS = {
  cafe: [{ id: 'serveur', title: 'Serveur·se', pay: 0 }, { id: 'barista', title: 'Barista', pay: 2, cert: 'barista' }, { id: 'gerant', title: 'Gérant·e du café', pay: 6, exp: 15 }],
  bakery: [{ id: 'vendeur', title: 'Vendeur·se en boulangerie', pay: -1 }, { id: 'boulanger', title: 'Boulanger·ère', pay: 2, cert: 'boulangerie' }, { id: 'chef', title: 'Chef boulanger·ère', pay: 6, cert: 'boulangerie', exp: 20 }],
  shop: [{ id: 'caissier', title: 'Caissier·ère', pay: 0 }, { id: 'rayon', title: 'Chef·fe de rayon', pay: 3, exp: 10 }, { id: 'gerant', title: 'Gérant·e de magasin', pay: 6, edu: 1, exp: 25 }],
  fashion: [{ id: 'vendeur', title: 'Vendeur·se', pay: 0 }, { id: 'conseil', title: 'Conseiller·ère mode', pay: 2, cert: 'vente' }, { id: 'resp', title: 'Responsable de boutique', pay: 6, exp: 20 }],
  garage: [{ id: 'apprenti', title: 'Apprenti·e mécanicien·ne', pay: -2 }, { id: 'meca', title: 'Mécanicien·ne', pay: 1, cert: 'mecanique' }, { id: 'chef', title: 'Chef·fe d’atelier', pay: 6, cert: 'mecanique', exp: 20 }],
  office: [{ id: 'assistant', title: 'Assistant·e', pay: 0 }, { id: 'compta', title: 'Comptable', pay: 3, edu: 2, cert: 'compta' }, { id: 'projet', title: 'Chef·fe de projet', pay: 6, edu: 2, exp: 15 }, { id: 'direction', title: 'Directeur·rice', pay: 12, edu: 3, exp: 30 }],
  cityhall: [{ id: 'accueil', title: 'Agent·e d’accueil', pay: 0 }, { id: 'secretaire', title: 'Secrétaire de mairie', pay: 3, edu: 1, exp: 10 }, { id: 'dgs', title: 'Directeur·rice des services', pay: 8, edu: 2, exp: 25 }],
  police: [{ id: 'agent', title: 'Agent·e de police', pay: 0 }, { id: 'brigadier', title: 'Brigadier·ère', pay: 3, exp: 20 }, { id: 'commissaire', title: 'Commissaire', pay: 9, edu: 3, exp: 30 }],
  hospital: [{ id: 'aide', title: 'Aide-soignant·e', pay: -2, edu: 1 }, { id: 'infirmier', title: 'Infirmier·ère', pay: 1, n: 2, edu: 2, cert: 'secourisme' }, { id: 'medecin', title: 'Médecin', pay: 10, edu: 3, exp: 10 }],
  firestation: [{ id: 'pompier', title: 'Pompier·ère', pay: 0, cert: 'secourisme' }, { id: 'sergent', title: 'Sergent·e', pay: 4, exp: 20 }, { id: 'capitaine', title: 'Capitaine', pay: 8, edu: 2, exp: 35 }],
  prison: [{ id: 'surveillant', title: 'Surveillant·e', pay: 0 }, { id: 'chef', title: 'Chef·fe de détention', pay: 5, edu: 1, exp: 20 }],
  school: [{ id: 'animateur', title: 'Animateur·rice', pay: -3, edu: 1 }, { id: 'prof', title: 'Enseignant·e', pay: 1, n: 2, edu: 2 }, { id: 'directeur', title: 'Directeur·rice d’école', pay: 7, edu: 3, exp: 20 }],
  court: [{ id: 'greffier', title: 'Greffier·ère', pay: -4, edu: 2 }, { id: 'avocat', title: 'Avocat·e', pay: 1, n: 3, edu: 3, cert: 'droit' }, { id: 'juge', title: 'Juge', pay: 8, edu: 3, exp: 30 }],
  bank: [{ id: 'guichet', title: 'Guichetier·ère', pay: 0, edu: 1 }, { id: 'conseil', title: 'Conseiller·ère bancaire', pay: 3, edu: 2, cert: 'compta' }, { id: 'directeur', title: 'Directeur·rice d’agence', pay: 9, edu: 3, exp: 25 }],
};
// Formations courtes à l'école (une séance de 3 h, payante) : ouvrent les postes qualifiés
export const CERTS = {
  barista: { name: 'Formation barista', cost: 60 },
  boulangerie: { name: 'CAP boulangerie', cost: 120 },
  vente: { name: 'Formation vente et conseil', cost: 50 },
  mecanique: { name: 'CAP mécanique', cost: 140 },
  compta: { name: 'Formation comptabilité', cost: 150, edu: 1 },
  secourisme: { name: 'Brevet de secourisme', cost: 40 },
  droit: { name: 'Examen du barreau', cost: 250, edu: 3 },
};
// Postes réels d'un lieu, selon son nombre de places (le poste d'entrée garde au moins une place)
export function positionsOf(b) {
  const list = POSITIONS[b.type];
  if (!list || !b.jobs) return [];
  let left = b.jobs.slots - 1;
  const out = [];
  for (const p of list.slice(1)) {
    const n = Math.min(p.n || 1, left);
    if (n <= 0) break;
    out.push({ ...p, slots: n, wage: b.jobs.wage + p.pay });
    left -= n;
  }
  return [{ ...list[0], slots: left + 1, wage: b.jobs.wage + list[0].pay }, ...out];
}
// Poste d'un contrat (anciens contrats : retrouvé par son intitulé, sinon poste d'entrée)
export function posOf(w, job) {
  if (!job || job.building == null) return null;
  const list = positionsOf(w.building(job.building));
  return list.find(p => p.id === job.pos) || list.find(p => p.title === job.title) || list[0] || null;
}
// Expérience dans un métier (jours travaillés) ; les habitants déjà en poste comptent leurs jours d'ancienneté
export function expOf(w, a, type) {
  if (!a.exp) {
    a.exp = {};
    if (a.job && !a.job.street) { const t = w.building(a.job.building)?.type; if (t) a.exp[t] = Math.max(0, w.day - (a.job.since || 0)) + (a.isPlayer ? 0 : 15); }
  }
  return a.exp[type] || 0;
}
export function freeSlots(w, b, posId) {
  const pos = positionsOf(b).find(p => p.id === posId);
  if (!pos) return 0;
  const taken = w.actors.filter(a => a.job && a.job.building === b.id && posOf(w, a.job)?.id === posId).length;
  return Math.max(0, pos.slots - taken - (posId === positionsOf(b)[0].id && w.economy ? w.economy.cut(b.id) : 0));
}
// Remplit-on les conditions d'un poste ? true, ou la raison (texte affiché)
export function qualifies(w, a, b, pos) {
  const edu = pos.edu ?? (b.jobs.edu || 0);
  if (edu > (a.education ?? 1)) return `Diplôme requis : niveau ${edu} (cours du soir à l’école)`;
  if (pos.cert && !(a.certs || []).includes(pos.cert)) return `Formation requise : ${CERTS[pos.cert].name} (à l’école)`;
  if (pos.exp && expOf(w, a, b.type) < pos.exp) return `Expérience requise : ${pos.exp} jours dans le métier (tu en as ${expOf(w, a, b.type)})`;
  return true;
}
// Meilleur poste libre accessible (le mieux payé), ou null
export function bestPosition(w, a, b) {
  return positionsOf(b).filter(p => freeSlots(w, b, p.id) > 0 && qualifies(w, a, b, p) === true && !(a.job && a.job.building === b.id && posOf(w, a.job)?.id === p.id))
    .sort((x, y) => y.wage - x.wage)[0] || null;
}

// ---------- Impôts ----------
// Impôt sur le revenu prélevé à la source : barème simplifié et progressif selon le salaire horaire
export const taxRate = wage => (wage < 13 ? 0.05 : wage < 17 ? 0.1 : wage < 21 ? 0.14 : 0.18);
export const PAYROLL_RATE = 0.3;   // cotisations des employeurs privés : 30 % des salaires versés, pour le Trésor
export const PROPERTY_TAX = 0.002; // taxe foncière : 0,2 % du prix du logement par semaine (propriétaires)

// Verse un salaire brut : l'impôt part au Trésor public, le reste sur le compte. Renvoie le net.
export function incomeTax(w, a, gross) {
  // le taux dépend aussi de la politique votée par le maire (impôts bas / normaux / hauts)
  const tax = gross * taxRate(a.job ? a.job.wage : 0) * (w.gov ? w.gov.taxMul : 1);
  a.money += gross - tax;
  a.taxWeek = (a.taxWeek || 0) + tax;
  credit(w, 'tax', tax);
  // Les agents des services publics (mairie, police, hôpital, pompiers, école, prison, tribunal, facteur, éboueurs)
  // sont payés par le Trésor : c'est l'impôt qui fait tourner la ville
  if (isPublicJob(w, a.job)) debit(w, 'wages', gross);
  // Les entreprises privées paient des cotisations sur les salaires qu'elles versent (elles aussi selon la politique du maire)
  else {
    credit(w, 'payroll', gross * PAYROLL_RATE * (w.gov ? w.gov.taxMul : 1));
    if (w.economy && a.job && !a.job.street) w.economy.paid(a.job.building, gross * (1 + PAYROLL_RATE)); // c'est l'entreprise qui paie
  }
  return gross - tax;
}

// Vendeur présent derrière le comptoir (quelqu'un en service dans ce lieu)
export function sellerAt(w, b, except = null) {
  return w.actors.find(o => o !== except && o.inside === b.id && (o.doing === 'work' || o.doing === 'overtime'));
}

// Prochaine ouverture : le prochain début de service d'un employé
export function nextOpening(w, b) {
  let best = null;
  for (const a of w.actors) {
    if (!a.job || a.job.building !== b.id || a.job.street) continue;
    const n = nextShift(a.job, w);
    if (n && (!best || n.start < best.start)) best = n;
  }
  return best;
}

export const JOB_TITLES = {
  office: 'Employé·e de bureau', cafe: 'Serveur·se', bakery: 'Boulanger·ère', shop: 'Caissier·ère',
  fashion: 'Vendeur·se', garage: 'Mécanicien·ne', cityhall: 'Agent·e de la mairie',
  police: 'Agent·e de police', hospital: 'Soignant·e', firestation: 'Pompier·ère', prison: 'Surveillant·e', school: 'Enseignant·e',
  court: 'Avocat·e', bank: 'Guichetier·ère',
};

// Intitulé d'un poste (les métiers de rue ont leur propre titre)
export const jobTitle = (w, job) => job.title || JOB_TITLES[w.building(job.building).type];

// Métier de rue (facteur, police…) : pas de bâtiment de travail, on patrouille dans le quartier
export function makeStreetJob({ title, icon, start, hours, days, wage, base }, day) {
  return {
    street: true, title, icon, building: base, wage, baseWage: wage, start, hours, days: [...days],
    warnings: 0, streak: 0, sick: 0, since: day, evaluated: day, log: null,
  };
}

export const weekdayOf = day => (day - 1) % 7;

export function makeJob(b, wage, day, evening = false, offset = 0) {
  const s = SHIFTS[b.type];
  const job = {
    building: b.id, wage, baseWage: wage, start: evening && s.alt ? s.alt : s.start, hours: s.hours,
    days: s.rotate ? s.days.map(d => (d + offset) % 7).sort((x, y) => x - y) : [...s.days], // services 7 j/7 : jours décalés entre collègues
    warnings: 0, streak: 0, sick: 0, since: day, evaluated: day, log: null,
  };
  // La police patrouille dans le quartier (payée dehors pendant le service), rattachée au commissariat
  if (b.type === 'police') Object.assign(job, { street: true, title: 'Agent·e de police', icon: '👮' });
  return job;
}

// (startDay : premier jour du contrat — rien avant, ni service, ni retard)
export const isWorkday = (job, day) => !(job.startDay && day < job.startDay) && job.days.includes(weekdayOf(day));

// Début / fin du service d'un jour, en minutes absolues
export function shiftOf(job, day) {
  const d0 = (day - 1) * 1440;
  return { start: d0 + job.start * 60, end: d0 + (job.start + job.hours) * 60 };
}

// Service en cours (on peut arriver jusqu'à 1 h en avance), sinon null
export function shiftNow(job, w) {
  if (!job || !isWorkday(job, w.day)) return null;
  const s = shiftOf(job, w.day);
  return w.minutes >= s.start - EARLY && w.minutes < s.end ? s : null;
}

export function nextShift(job, w) {
  for (let d = w.day; d < w.day + 8; d++) {
    if (!isWorkday(job, d)) continue;
    const s = shiftOf(job, d);
    if (s.end > w.minutes) return { ...s, day: d };
  }
  return null;
}

export function todayLog(job, day) {
  if (!job.log || job.log.day !== day) job.log = { day, arrived: null, worked: 0, excused: false };
  return job.log;
}

export const fmtShift = job => `${job.start}h–${job.start + job.hours}h`;

export function openings(w, b) {
  if (!b.jobs) return 0;
  if (w.city && w.city.biz[b.id] && w.city.biz[b.id].closed) return 0; // local fermé (faillite)
  if (POSITIONS[b.type]) return positionsOf(b).reduce((t, p) => t + freeSlots(w, b, p.id), 0);
  const taken = w.actors.filter(a => a.job && a.job.building === b.id).length;
  return Math.max(0, b.jobs.slots - taken);
}

// Bilan de la journée, 30 min après la fin du service.
export function reviewDay(w, a) {
  const job = a.job;
  if (!job || job.evaluated === w.day || !isWorkday(job, w.day)) return;
  const s = shiftOf(job, w.day);
  if (w.minutes < s.end + 30) return;
  job.evaluated = w.day;
  if (job.since === w.day) return; // jour d'embauche : pas compté

  const log = todayLog(job, w.day);
  if (log.excused) return;
  let reason = null;
  if (log.worked < 60) reason = 'absence';
  else if (log.arrived > s.start + 30) reason = 'retard';
  else if (log.worked < job.hours * 60 - 90) reason = 'départ anticipé';

  if (reason) {
    job.warnings++;
    job.streak = 0;
    if (job.warnings >= MAX_WARNINGS) {
      const building = w.building(job.building);
      a.job = null;
      a.firedDay = w.day;
      w.emit('fired', { actor: a, building, reason });
    } else {
      w.emit('jobWarning', { actor: a, reason, warnings: job.warnings });
    }
  } else {
    job.streak++;
    const bt = w.building(job.building)?.type; // un jour de plus d'expérience dans ce métier
    if (bt) { expOf(w, a, bt); a.exp[bt] = (a.exp[bt] || 0) + 1; }
    if (job.streak % RAISE_EVERY === 0) {
      if (job.warnings > 0) job.warnings--;
      if (job.wage + 1 <= Math.round((job.baseWage || job.wage) * RAISE_CAP)) {
        job.wage += 1;
        w.emit('raise', { actor: a, wage: job.wage });
      }
    }
  }
}
