// Conversions grille <-> écran pour la vue isométrique.
export const TW = 64; // largeur d'une case (losange)
export const TH = 32; // hauteur d'une case

export const toScreen = (x, y) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 });

export const toTile = (sx, sy) => {
  const fx = (sx / (TW / 2) + sy / (TH / 2)) / 2;
  const fy = (sy / (TH / 2) - sx / (TW / 2)) / 2;
  return { x: Math.round(fx), y: Math.round(fy) };
};
