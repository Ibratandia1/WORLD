import { openings, shiftNow } from './jobs.js';

// Relations entre habitants (0 à 100), symétriques.
export const LEVELS = [[60, 'Proche', '💞'], [30, 'Ami·e', '💛'], [10, 'Connaissance', '🙂'], [0, 'Inconnu·e', '👤']];

export const rel = (a, b) => a.relations[b.id] || 0;

export const ROLE_TITLES = { manager: 'Responsable', landlord: 'Propriétaire du quartier', police: 'Police', postman: 'Facteur' };
export const roleOf = (w, role) => w.actors.find(o => o.role === role);
// Responsable du lieu de travail d'un acteur
export const managerOf = (w, a) => (a.job ? w.actors.find(o => o !== a && o.role === 'manager' && o.job && o.job.building === a.job.building) : null);
export const level = v => LEVELS.find(l => v >= l[0]);

export function addRel(a, b, v) {
  const n = Math.max(0, Math.min(100, rel(a, b) + v));
  a.relations[b.id] = n;
  b.relations[a.id] = n;
}

// Même lieu, ou dehors à moins de 2,5 cases
export function near(a, b) {
  if (a.inside != null || b.inside != null) return a.inside === b.inside;
  return Math.hypot(a.px - b.px, a.py - b.py) <= 2.5;
}

export const nearby = (w, a) => w.actors.filter(o => o !== a && near(a, o));

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Ce que répond `t` quand `a` vient lui parler : dépend de sa situation réelle.
export function reply(w, t, a) {
  const lines = [];
  const b = t.job && w.building(t.job.building);
  if (t.doing === 'work') lines.push('Je travaille, là ! On se voit après ?');
  if (t.hunger > 60) lines.push('J’ai une de ces faims… La Boulangerie Dorée fait de super sandwichs.');
  if (t.energy < 30) lines.push('Je suis à bout de forces, vivement ce soir.');
  if (t.money < 60) lines.push('Fin de mois difficile… le loyer m’a mis à sec.');
  if (t.home == null) lines.push('Je dors au métro en ce moment… c’est dur.');
  if (!t.job) lines.push('Je cherche du travail, si tu entends parler de quelque chose…');
  if (b && openings(w, b) > 0) lines.push(`Chez ${b.name}, on cherche quelqu’un. Tente ta chance !`);
  if (w.weather === 'rain') lines.push('Quel temps… Et moi qui ai oublié mon parapluie.');
  if (rel(t, a) >= 30) lines.push('Toujours un plaisir de te voir !');
  if (!lines.length) lines.push('Belle journée dans le Marais, non ?');
  return `${t.name} : « ${pick(lines)} »`;
}

// Petites phrases affichées dans les bulles pendant une discussion
const OPENERS = ['Salut !', 'Ça va ?', 'Oh, toi !', 'Quoi de neuf ?', 'Hey !'];
const TOPICS = [
  'Quelle journée…', 'Tu as goûté le pain de la Dorée ?', 'Il paraît que ça recrute.', 'Vivement le week-end !',
  'Le Marais est bondé aujourd’hui.', 'J’ai vu Bernard passer.', 'Tu viens au café après ?', 'Haha, carrément !',
  'Ah bon ? Raconte !', 'Non, sérieux ?', 'Je te crois pas !', 'Trop bien.', 'Bon courage !', 'À plus tard !',
];
export function chatterLine(w, a, step) {
  if (step === 0) return pick(OPENERS);
  if (w.weather === 'rain' && Math.random() < 0.3) return 'Encore cette pluie…';
  if (a.hunger > 65 && Math.random() < 0.4) return 'J’ai trop faim, moi.';
  if (a.energy < 30 && Math.random() < 0.4) return 'Je suis crevé·e.';
  if (a.money < 60 && Math.random() < 0.3) return 'Fin de mois difficile…';
  return pick(TOPICS);
}

// Peut-on demander à quelqu'un de s'arrêter pour discuter ?
// Pas s'il travaille, dort, part faire quelque chose, ou si son service commence bientôt.
export function canPause(t, w) {
  if (t.doing && t.doing !== 'listen' && t.doing !== 'talk') return false;
  if (t.plan && t.plan.id !== 'goto') return false;
  if (w && t.job && !t.job.street && shiftNow(t.job, w)) return false;
  return true;
}

export function tip(w, a, t) {
  const open = w.map.buildings.filter(b => openings(w, b) > 0 && !(a.job && a.job.building === b.id));
  if (!open.length) return `${t.name} : « Je ne vois rien en ce moment, désolé·e. »`;
  const b = pick(open);
  return `${t.name} : « ${b.name} recrute à ${b.jobs.wage} €/h. Dis que tu viens de ma part ! »`;
}
