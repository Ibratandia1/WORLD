// Meubles et déco de son logement : achetés depuis chez soi (livrés tout de suite), placés automatiquement dans
// l'appartement / la maison, ils donnent du confort (moral qui remonte à la maison, meilleur sommeil) et de
// nouvelles activités (console, piano, aquarium…). Simulation pure : seulement des données (plans de layouts.js).
import { LAYOUTS, floorsOf } from '../interiors/layouts.js';

// k = type de meuble dessiné (interior3d.js), comfort = points de confort, actions = ce qu'on fait en le touchant
export const FURNITURE = [
  { id: 'plante', name: 'Plante verte', icon: '🪴', price: 25, k: 'plant', comfort: 2 },
  { id: 'grande_plante', name: 'Grande plante', icon: '🌿', price: 60, k: 'bigplant', comfort: 3 },
  { id: 'tapis', name: 'Tapis berbère', icon: '🧶', price: 70, k: 'rug', c: 0xc9453f, w: 1.3, d: 0.9, flat: true, comfort: 3 },
  { id: 'lampe', name: 'Lampadaire', icon: '💡', price: 55, k: 'floorlamp', comfort: 3 },
  { id: 'fauteuil', name: 'Fauteuil club', icon: '🪑', price: 180, k: 'armchair', c: 0x8a4a2a, comfort: 5, actions: ['read_book', 'nap'] },
  { id: 'biblio', name: 'Bibliothèque', icon: '📚', price: 150, k: 'bookshelf', comfort: 4, actions: ['read_book'] },
  { id: 'canape', name: 'Canapé moelleux', icon: '🛋️', price: 420, k: 'sofa', c: 0x2f7d8b, comfort: 8, actions: ['watch_tv', 'nap', 'read_book'] },
  { id: 'aquarium', name: 'Aquarium', icon: '🐠', price: 240, k: 'aquarium', comfort: 6, actions: ['watch_fish'] },
  { id: 'console', name: 'Console de jeux', icon: '🎮', price: 350, k: 'gameconsole', comfort: 5, actions: ['play_games'] },
  { id: 'piano', name: 'Piano droit', icon: '🎹', price: 900, k: 'piano', comfort: 7, actions: ['play_piano'] },
  { id: 'lit_double', name: 'Grand lit douillet', icon: '🛏️', price: 650, k: 'bed', c: 0xe86a8c, comfort: 6, sleepBoost: 0.25, actions: ['sleep', 'nap'] },
];
export const MAX_FURNITURE = 10;
export const COMFORT_CAP = 40;
export const furnById = id => FURNITURE.find(f => f.id === id);
export const comfortOf = a => Math.min(COMFORT_CAP, (a.furniture || []).reduce((s, f) => s + (furnById(f.id)?.comfort || 0), 0));
export const sleepBoost = a => (a.furniture || []).reduce((m, f) => Math.max(m, furnById(f.id)?.sleepBoost || 0), 0);
export const homeLayout = b => LAYOUTS[b.style && LAYOUTS[b.style] ? b.style : b.type];

// Étage où poser un meuble : l'appartement (dernier étage de l'immeuble) ; dans une maison, le lit en haut, le reste en bas
function floorFor(b, it) {
  const fl = floorsOf(homeLayout(b));
  if (fl.length === 1) return 0;
  if (b.style === 'house') return it.k === 'bed' ? 1 : 0;
  return fl.length - 1;
}

// Case libre pour un nouveau meuble (contre les murs du fond d'abord), ou null s'il n'y a plus de place
export function placeFor(a, w, it) {
  const b = a.home != null ? w.building(a.home) : null;
  if (!b) return null;
  const fi = floorFor(b, it), F = floorsOf(homeLayout(b))[fi];
  const mine = (a.furniture || []).filter(f => f.floor === fi);
  const taken = new Set([
    ...F.items.filter(x => !x.wall && (!x.flat || it.flat)).map(x => `${x.x},${x.y}`),
    ...(it.flat ? [] : F.stations.map(s => `${s.x},${s.y}`)), // (un tapis peut aller sous les pieds)
    ...(F.entrance ? [`${F.entrance.x},${F.entrance.y}`, `${F.entrance.x},${F.entrance.y - 1}`] : []),
    ...mine.filter(f => !!furnById(f.id)?.flat === !!it.flat).map(f => `${f.x},${f.y}`),
  ]);
  for (const z of F.zones) for (const [dx, dy] of z.doors || []) taken.add(`${dx},${dy}`);
  for (const x of F.items) if (x.k === 'stairs_up') { taken.add(`${x.x},${x.y - 1}`); taken.add(`${x.x},${x.y + 1}`); }
  const cands = [];
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (!taken.has(`${x},${y}`)) cands.push({ x, y });
  // contre un mur (fond ou côtés) d'abord, au milieu de la pièce en dernier
  const wallDist = p => Math.min(p.y, p.x, F.w - 1 - p.x);
  cands.sort((p, q) => (it.flat ? -1 : 1) * (wallDist(p) - wallDist(q)) || p.y - q.y || p.x - q.x);
  return cands.length ? { x: cands[0].x, y: cands[0].y, floor: fi } : null;
}

// Déménagement : les meubles suivent, replacés dans le nouveau logement (ceux qui ne rentrent pas restent au garde-meuble)
export function ensurePlaced(a, w) {
  if (a.home == null || !a.furniture || !a.furniture.length || a.furnHome === a.home) return;
  const all = a.furniture; a.furniture = [];
  for (const f of all) { const it = furnById(f.id), pos = it && placeFor(a, w, it); if (pos) a.furniture.push({ id: f.id, ...pos }); else a.stored = [...(a.stored || []), f.id]; }
  a.furnHome = a.home;
}

// Meubles du joueur ajoutés au plan de son logement (pour l'intérieur : dessin, toucher, places des gens)
export function furnishedFloors(floors, a) {
  if (!a.furniture || !a.furniture.length) return floors;
  return floors.map((F, fi) => {
    const extra = a.furniture.filter(f => f.floor === fi).map(f => {
      const d = furnById(f.id);
      if (!d) return null;
      return { k: d.k, x: f.x, y: f.y, c: d.c, w: d.w, d: d.d, flat: !!d.flat, name: d.name, actions: d.actions, action: d.actions ? d.actions[0] : undefined };
    }).filter(Boolean);
    return extra.length ? { ...F, items: [...F.items, ...extra] } : F;
  });
}
