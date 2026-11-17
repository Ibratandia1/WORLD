// Emploi : contrats, horaires, semaine, avertissements, augmentations, renvoi.
// Mêmes règles pour le joueur et les PNJ.
import { credit, debit, isPublicJob } from './budget.js';

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const MAX_WARNINGS = 3;
export const RAISE_EVERY = 15; // jours sans faute avant une augmentation
export const RAISE_CAP = 1.3;  // salaire max = 130 % du salaire d'embauche
export const EARLY = 60;       // on peut arriver jusqu'à 1 h avant son service

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

// Plusieurs métiers dans un même lieu : le titre dépend de l'ordre d'embauche
export function roleTitle(type, rank) {
  if (type === 'court') return rank === 0 ? 'Juge' : rank === 3 ? 'Greffier·ère' : 'Avocat·e';
  if (type === 'bank') return rank === 0 ? 'Conseiller·ère bancaire' : 'Guichetier·ère';
  return null;
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
  else credit(w, 'payroll', gross * PAYROLL_RATE * (w.gov ? w.gov.taxMul : 1));
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
    if (job.streak % RAISE_EVERY === 0) {
      if (job.warnings > 0) job.warnings--;
      if (job.wage + 1 <= Math.round((job.baseWage || job.wage) * RAISE_CAP)) {
        job.wage += 1;
        w.emit('raise', { actor: a, wage: job.wage });
      }
    }
  }
}
