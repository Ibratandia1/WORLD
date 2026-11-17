// Budget de la ville : chaque euro qui entre au Trésor public (world.treasury) ou qui en sort est inscrit ici,
// par catégorie, pour la semaine en cours (w.budget.week) ; le lundi, la semaine est close (w.budget.last).
// Recettes : impôts payés par les habitants et les commerces (+ dotation de l'État, elle aussi payée par l'impôt).
// Dépenses : les services publics (salaires des agents, entretien des rues, aides, indemnités).

export const INCOME = {
  tax: 'Impôt sur le revenu', payroll: 'Cotisations des entreprises', vat: 'TVA des commerces', property: 'Taxe foncière', fines: 'Amendes', grant: 'Dotation de l’État',
};
export const SPEND = {
  wages: 'Salaires des services publics', upkeep: 'Entretien des rues et de l’éclairage', aid: 'Aides sociales',
  mayor: 'Indemnité du maire', jurors: 'Indemnités des jurés', projects: 'Projets du maire',
};
// Lieux de service public : les salaires y sont payés par le Trésor (et les métiers de rue : police, facteur, éboueurs)
export const PUBLIC_TYPES = new Set(['cityhall', 'police', 'hospital', 'firestation', 'prison', 'school', 'court']);
export const isPublicJob = (w, job) => !!job && (job.street || (w.building(job.building) && PUBLIC_TYPES.has(w.building(job.building).type)));

const ensure = w => { if (!w.budget) w.budget = { week: {}, last: null }; return w.budget; };

export function credit(w, cat, n) {
  if (!(n > 0)) return;
  w.treasury = (w.treasury || 0) + n;
  const b = ensure(w); b.week[cat] = (b.week[cat] || 0) + n;
}
export function debit(w, cat, n) {
  if (!(n > 0)) return;
  w.treasury = (w.treasury || 0) - n;
  const b = ensure(w); b.week[cat] = (b.week[cat] || 0) + n;
}

// Clôture de la semaine : renvoie le bilan { income, spend, lines }
export function closeWeek(w) {
  const b = ensure(w);
  const sum = keys => Object.keys(keys).reduce((t, k) => t + (b.week[k] || 0), 0);
  const res = { ...b.week, income: Math.round(sum(INCOME)), spend: Math.round(sum(SPEND)), day: w.day };
  b.last = res;
  b.week = {};
  return res;
}
