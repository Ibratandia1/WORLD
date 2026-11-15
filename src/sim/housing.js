import { weekdayOf } from './jobs.js';

// Logement : loyer hebdomadaire, relances, expulsion, achat.
export const LATE_REMINDER = 4; // jours de retard avant la relance
export const LATE_EVICT = 8;    // jours de retard avant l'expulsion

export const weeklyRent = b => b.rent * 7;
export const occupants = (w, b) => w.actors.filter(a => a.home === b.id);

// Appelé à chaque nouveau jour. Le loyer de la semaine tombe le lundi.
export function newDayHousing(w) {
  const monday = weekdayOf(w.day) === 0;
  for (const a of w.actors) {
    if (a.housing !== 'rent' || a.home == null) continue;
    if (a.rentDue > 0) {
      a.rentLate++;
      if (a.rentLate === LATE_REMINDER) w.emit('rentReminder', { actor: a });
      if (a.rentLate >= LATE_EVICT) {
        const building = w.building(a.home);
        if (a.inside === a.home) w.cancel(a, true);
        a.home = null; a.housing = null; a.rentDue = 0; a.rentLate = 0;
        w.emit('evicted', { actor: a, building });
        continue;
      }
    }
    if (monday) {
      const amount = weeklyRent(w.building(a.home));
      a.rentDue += amount;
      w.emit('rentBill', { actor: a, amount });
    }
  }
}
