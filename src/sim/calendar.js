// Le temps qui passe (world.calendar) : années de 4 saisons (56 jours), âge et anniversaire de chaque habitant,
// retraite à 65 ans (pension versée par le Trésor le lundi), Nouvel An avec le bilan de ton année.
// Simulation pure (aucun affichage). Événements émis : newYear { year }, birthday { actor, age }, retired { actor }.
import { debit } from './budget.js';
// (même valeur que SEASON_DAYS dans world.js ; pas d'import : world.js → actions.js → calendar.js ferait une boucle)
const SEASON_DAYS = 14;
import { rel } from './social.js';

export const YEAR_DAYS = SEASON_DAYS * 4;
export const RETIRE_AGE = 65;
export const PENSION = 220;   // € par semaine
export const yearOf = day => Math.floor((day - 1) / YEAR_DAYS) + 1;
export const dayOfYear = day => ((day - 1) % YEAR_DAYS) + 1;

const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17);
// Âge de départ selon le métier (crédible : un·e juge n'a pas 20 ans), sinon entre 19 et 70 ans
function startAge(a) {
  const h = hash(a.name || a.id);
  if (a.isPlayer) return 25;
  const t = (a.job && a.job.title) || '';
  if (a.role === 'landlord' || a.role === 'mayor') return 48 + h % 15;
  if (/Juge|Médecin|Directeur|Commissaire|Gérant/.test(t)) return 38 + h % 20;
  if (a.job) return 21 + h % 36;
  if (a.newcomer != null) return 19 + h % 40; // ceux qui emménagent viennent pour travailler
  return 19 + h % 52;
}
// Âge et anniversaire (donnés à la première occasion : anciennes sauvegardes, nouveaux arrivants)
export function ensureAge(a) {
  if (a.age == null) a.age = startAge(a);
  if (a.birthday == null) a.birthday = 1 + hash((a.name || '') + a.id) % YEAR_DAYS;
  return a.age;
}
export const isBirthday = (w, a) => { ensureAge(a); return a.birthday === dayOfYear(w.day); };

export class Calendar {
  constructor(world) {
    this.w = world;
    world.calendar = this;
    world.on('newDay', () => this.newDay());
    for (const a of world.actors) ensureAge(a);
    world.on('actorAdded', e => ensureAge(e.actor));
  }

  newDay() {
    const w = this.w, doy = dayOfYear(w.day);
    for (const p of w.actors) if (p.isPlayer && !p.yearStart && doy !== 1) p.yearStart = { money: p.money + (p.bank || 0) - (p.loan || 0), xp: (p.goals && p.goals.xp) || 0, day: w.day };
    // Nouvel An : une année de plus au compteur, le bilan de l'année pour le joueur
    if (doy === 1 && w.day > 1) {
      const year = yearOf(w.day);
      w.emit('newYear', { year });
      for (const p of w.actors.filter(x => x.isPlayer)) {
        const s = p.yearStart || { money: p.money + (p.bank || 0), xp: 0, day: 1 };
        const wealth = p.money + (p.bank || 0) - (p.loan || 0);
        const friends = w.actors.filter(o => o !== p && rel(p, o) >= 50).length;
        w.emit('yearRecap', { actor: p, year: year - 1, gained: Math.round(wealth - s.money), xp: Math.round(((p.goals && p.goals.xp) || 0) - (s.xp || 0)), friends });
        p.yearStart = { money: wealth, xp: (p.goals && p.goals.xp) || 0, day: w.day };
      }
      if (w.city) w.city.post('🎆', `Bonne année ! Le quartier fête l’an ${year} : feu d’artifice sur la Seine à minuit.`);
    }
    for (const a of w.actors) {
      ensureAge(a);
      if (a.birthday === doy && w.day > 1) {
        a.age++;
        w.emit('birthday', { actor: a, age: a.age });
        // l'anniversaire d'un ami du joueur passe dans le journal
        const pl = w.actors.find(x => x.isPlayer);
        if (pl && a !== pl && rel(pl, a) >= 30 && w.city) w.city.post('🎂', `C’est l’anniversaire de ${a.name} aujourd’hui (${a.age} ans). Pense à lui souhaiter !`);
      }
      // Retraite : à 65 ans, les habitants quittent leur travail (le joueur, lui, choisit)
      if (!a.isPlayer && a.age >= RETIRE_AGE && a.job && !a.retired && !['mayor', 'landlord'].includes(a.role)) {
        a.job = null; a.retired = true;
        w.emit('retired', { actor: a });
        if (w.city) w.city.post('🎉', `${a.name} prend sa retraite à ${a.age} ans. Son poste se libère.`);
      }
      if (a.isPlayer && a.age >= RETIRE_AGE && !a.job) a.retired = true;
    }
    // Pensions le lundi (versées par la ville)
    if (w.weekday === 0) {
      for (const a of w.actors) if (a.retired && !a.job) { a.money += PENSION; debit(w, 'pensions', PENSION); }
    }
  }
}
