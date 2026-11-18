import { weekdayOf } from './jobs.js';

// Logement : loyer hebdomadaire, relances, expulsion, achat.
export const LATE_REMINDER = 4; // jours de retard avant la relance
export const LATE_EVICT = 8;    // jours de retard avant l'expulsion

// (rentMul : le marché du logement, ajusté chaque lundi par sim/economy.js selon les logements libres)
export const weeklyRent = b => Math.round(b.rent * 7 * (b.rentMul || 1));
export const occupants = (w, b) => w.actors.filter(a => a.home === b.id);
// Investissement locatif : appartements achetés pour être loués (actor.rentals = ids des immeubles, un par appartement).
// Un appartement loué est occupé par un locataire (il n'est plus libre pour les autres).
export const rentalsIn = (w, b) => w.actors.reduce((t, a) => t + (a.rentals ? a.rentals.filter(id => id === b.id).length : 0), 0);
export const rentalPrice = b => Math.round(b.price * (b.rentMul || 1));       // prix d'achat, suit le marché
export const rentalIncome = b => Math.round(weeklyRent(b) * 0.85);              // loyer net de frais de gestion (15 %)
export const RENTAL_RESALE = 0.9;                                                // revente : 90 % du prix du marché

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
