// Tout ce qui s'achète en boutique. `shop` = type de lieu où on le trouve.
//   look     modifie l'apparence (tenues, chapeaux, lunettes)
//   vehicle  speed = multiplicateur de vitesse dans la rue ; weekly = assurance / entretien chaque lundi
//   item     objet spécial (ex. smartphone : parler à ses amis à distance)

export const CATALOG = [
  // Maison Plume (mode)
  { id: 'mariniere', shop: 'fashion', cat: 'Tenues', name: 'Marinière', icon: '🎽', price: 45, look: { outfit: 'mariniere' } },
  { id: 'sweat', shop: 'fashion', cat: 'Tenues', name: 'Sweat à capuche', icon: '👕', price: 60, look: { outfit: 'sweat' } },
  { id: 'robe', shop: 'fashion', cat: 'Tenues', name: 'Robe d’été', icon: '👗', price: 90, look: { outfit: 'robe' } },
  { id: 'veste', shop: 'fashion', cat: 'Tenues', name: 'Veste en cuir', icon: '🧥', price: 180, look: { outfit: 'veste' } },
  { id: 'costume', shop: 'fashion', cat: 'Tenues', name: 'Costume', icon: '🤵', price: 320, look: { outfit: 'costume' } },
  { id: 'beret', shop: 'fashion', cat: 'Accessoires', name: 'Béret', icon: '🧢', price: 35, look: { hat: 'beret' } },
  { id: 'chapeau', shop: 'fashion', cat: 'Accessoires', name: 'Chapeau', icon: '🎩', price: 55, look: { hat: 'chapeau' } },
  { id: 'solaires', shop: 'fashion', cat: 'Accessoires', name: 'Lunettes de soleil', icon: '🕶️', price: 40, look: { accessory: 'solaires' } },

  // Garage Roue Libre (véhicules)
  { id: 'trottinette', shop: 'garage', cat: 'Véhicules', name: 'Trottinette', icon: '🛴', price: 120, vehicle: { speed: 1.4, weekly: 0 } },
  { id: 'velo', shop: 'garage', cat: 'Véhicules', name: 'Vélo de ville', icon: '🚲', price: 250, vehicle: { speed: 1.7, weekly: 0 } },
  { id: 'scooter', shop: 'garage', cat: 'Véhicules', name: 'Scooter', icon: '🛵', price: 1400, vehicle: { speed: 2.2, weekly: 15 } },
  { id: 'voiture', shop: 'garage', cat: 'Véhicules', name: 'Petite citadine', icon: '🚗', price: 6500, vehicle: { speed: 2.8, weekly: 40 } },

  // Supérette
  { id: 'smartphone', shop: 'shop', cat: 'Objets', name: 'Smartphone', icon: '📱', price: 300, item: 'phone' },
];

export const itemById = id => CATALOG.find(i => i.id === id);
export const hasPhone = a => a.owned.includes('smartphone');
export const vehicleOf = a => (a.vehicle ? itemById(a.vehicle) : null);
