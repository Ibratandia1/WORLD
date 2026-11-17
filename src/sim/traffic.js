// Feux tricolores et code de la route des piétons (simulation pure, sans Phaser).
// Chaque carrefour alterne : voitures dans le sens x (vert puis orange), puis sens y. Cycle de 6 min de jeu,
// décalé d'un carrefour à l'autre. Les piétons traversent sur les passages piétons quand les voitures de cette
// rue ont le rouge. Traverser ailleurs, sous les yeux de la police : amende (JAYWALK_FINE).

export const CYCLE = 6;           // minutes de jeu
export const JAYWALK_FINE = 35;   // €
const GREEN = 2.5, AMBER = 0.5;   // durées pour chaque sens

export function phase(w, jx, jy) {
  const t = (w.minutes + ((jx * 3 + jy * 5) % CYCLE)) % CYCLE;
  if (t < GREEN) return { green: 'x', amber: false };
  if (t < GREEN + AMBER) return { green: 'x', amber: true };
  if (t < 2 * GREEN + AMBER) return { green: 'y', amber: false };
  return { green: 'y', amber: true };
}

// Une voiture qui roule dans le sens `axis` peut-elle entrer dans le carrefour ?
export const carMayGo = (w, jx, jy, axis) => phase(w, jx, jy).green === axis;

// Un piéton peut-il s'engager sur ce passage piéton ? (les voitures de cette rue ont le rouge, sans orange)
export function walkMayGo(w, crossing) {
  const p = phase(w, crossing.jx, crossing.jy);
  return p.green !== crossing.axis && !p.amber;
}
