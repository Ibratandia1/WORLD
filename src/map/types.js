// Apparence et règles par type de lieu.
// Murs crème et toits en zinc bleu-gris : l'esprit des immeubles parisiens.
const CREAM = { left: 0xf1e4c8, right: 0xd8c6a2, roof: 0x8796b0 };

export const TYPES = {
  home:   { icon: '🏠', height: 72, ...CREAM, firstFloor: 10 },
  office: { icon: '💼', height: 104, left: 0xa9cbe6, right: 0x86abcb, roof: 0x5f6c86, glass: true },
  cafe:   { icon: '☕', height: 56, ...CREAM, awning: 0xd8504d, firstFloor: 30 },
  bakery: { icon: '🥐', height: 56, ...CREAM, awning: 0xe5a33a, firstFloor: 30 },
  shop:   { icon: '🛒', height: 56, ...CREAM, awning: 0x3fae73, firstFloor: 30 },
  metro:  { icon: '🚇', height: 22, left: 0x3c8c64, right: 0x2f7352, roof: 0x4fae7f },
  fashion: { icon: '👗', height: 60, ...CREAM, awning: 0xd94f9c, firstFloor: 30 },
  garage: { icon: '🚲', height: 46, left: 0xc9ced8, right: 0xaab0bc, roof: 0x5f6c86, awning: 0x2f7d5b, firstFloor: 30 },
};
