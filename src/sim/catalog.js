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
  // mode : 'bike' = piste cyclable (et trottoir au pas), 'motor' = sur la chaussée seulement (à pied pour rejoindre la porte)
  { id: 'trottinette', shop: 'garage', cat: 'Véhicules', name: 'Trottinette', icon: '🛴', price: 120, vehicle: { speed: 1.6, weekly: 0, mode: 'bike' } },
  { id: 'velo', shop: 'garage', cat: 'Véhicules', name: 'Vélo de ville', icon: '🚲', price: 250, vehicle: { speed: 2.1, weekly: 0, mode: 'bike' } },
  { id: 'scooter', shop: 'garage', cat: 'Véhicules', name: 'Scooter', icon: '🛵', price: 1400, vehicle: { speed: 3, weekly: 15, mode: 'motor' } },
  { id: 'voiture', shop: 'garage', cat: 'Véhicules', name: 'Petite citadine', icon: '🚗', price: 6500, vehicle: { speed: 3.8, weekly: 40, mode: 'motor' } },

  // Supérette
  { id: 'smartphone', shop: 'shop', cat: 'Objets', name: 'Smartphone', icon: '📱', price: 300, item: 'phone' },
  // Cadeaux à offrir (consommables : on peut en acheter plusieurs) — gift = gain de relation
  { id: 'chocolats', shop: 'shop', cat: 'Cadeaux', name: 'Boîte de chocolats', icon: '🍫', price: 8, consumable: true, gift: 10 },
  { id: 'fleurs', shop: 'shop', cat: 'Cadeaux', name: 'Bouquet de fleurs', icon: '💐', price: 15, consumable: true, gift: 15 },
];

export const itemById = id => CATALOG.find(i => i.id === id);
export const hasPhone = a => a.owned.includes('smartphone');
export const vehicleOf = a => (a.vehicle ? itemById(a.vehicle) : null);
