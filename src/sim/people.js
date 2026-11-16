import { Actor } from './actor.js';
import { makeJob, makeStreetJob } from './jobs.js';

// Habitants de départ. `home` et `job.at` sont des lettres de la carte.
// role : fonction dans le quartier (manager = responsable du lieu de travail, landlord = propriétaire…)
// street : métier de rue (tournée dans le quartier pendant le service)
// En multijoueur, un vrai joueur pourra prendre la place de n'importe lequel.
// ⚠ Toujours ajouter les nouveaux habitants À LA FIN (les sauvegardes retrouvent les gens par leur ordre).
export const PEOPLE = [
  { name: 'Toi', controller: 'player', home: 'A', job: { at: 'O', wage: 15 }, money: 300,
    look: { body: 0xf2c94c, hairColor: 0x4a3020, hairStyle: 'court', skin: 0xf1c7a3, legs: 0x3a4766, accessory: 'aucun' } },
  { name: 'Inès', home: 'B', job: { at: 'C', wage: 12 }, money: 220, role: 'manager',
    look: { body: 0xe86a8c, hairColor: 0x2b1d16, hairStyle: 'long', skin: 0xc98e6a, legs: 0x2e3550, accessory: 'aucun' } },
  { name: 'Karim', home: 'D', job: { at: 'O', wage: 17 }, money: 520, role: 'manager', owned: ['velo'], vehicle: 'velo',
    look: { body: 0x5b8def, hairColor: 0x1c1410, hairStyle: 'court', skin: 0xb57a52, legs: 0x2a2f3d, accessory: 'lunettes', outfit: 'costume', build: 'fort' } },
  { name: 'Léa', home: 'E', job: { at: 'K', wage: 11 }, money: 180, role: 'manager',
    look: { body: 0x9b6ee8, hairColor: 0xd9a441, hairStyle: 'queue', skin: 0xf6d3b8, legs: 0x3b3b4f, accessory: 'aucun', build: 'mince' } },
  { name: 'Hugo', home: 'F', job: { at: 'P', wage: 19 }, money: 800, role: 'manager', owned: ['voiture'], vehicle: 'voiture',
    look: { body: 0x4bbf8b, hairColor: 0x7a4a2a, hairStyle: 'crete', skin: 0xf0c4a0, legs: 0x2f3442, accessory: 'aucun', outfit: 'veste' } },
  { name: 'Awa', home: 'B', job: { at: 'S', wage: 12 }, money: 260, role: 'manager',
    look: { body: 0xf08a3c, hairColor: 0x111111, hairStyle: 'afro', skin: 0x7a4a30, legs: 0x3a3a5a, accessory: 'aucun' } },
  { name: 'Théo', home: 'D', job: { at: 'R', wage: 12 }, money: 150, role: 'manager',
    look: { body: 0x3cb5c9, hairColor: 0xb5651d, hairStyle: 'casquette', skin: 0xf6d0b4, legs: 0x25304a, accessory: 'aucun' } },
  { name: 'Chloé', home: 'E', job: { at: 'L', wage: 11 }, money: 210, role: 'manager',
    look: { body: 0xd94f9c, hairColor: 0x5a3220, hairStyle: 'long', skin: 0xe9b995, legs: 0x323246, accessory: 'echarpe', outfit: 'robe' } },
  { name: 'Marcel', home: 'F', job: null, money: 60,
    look: { body: 0x8a8f99, hairColor: 0xdddddd, hairStyle: 'chauve', skin: 0xf0c8a8, legs: 0x4a3a2a, accessory: 'moustache' } },

  // --- Nouveaux habitants : des métiers comme dans la vraie vie ---
  { name: 'Yanis', home: 'B', job: { at: 'Y', wage: 13 }, money: 340, role: 'manager',
    look: { body: 0x111111, hairColor: 0x2b1d16, hairStyle: 'court', skin: 0xb57a52, legs: 0x2a2f3d, accessory: 'solaires', outfit: 'mariniere' } },
  { name: 'Jo', home: 'D', job: { at: 'V', wage: 15 }, money: 410, role: 'manager', owned: ['velo'], vehicle: 'velo',
    look: { body: 0x2f7d5b, hairColor: 0x7a4a2a, hairStyle: 'casquette', skin: 0xf0c4a0, legs: 0x3a4766, accessory: 'aucun' } },
  { name: 'Bernard', home: 'E', money: 280, role: 'postman', owned: ['velo'], vehicle: 'velo',
    street: { title: 'Facteur', icon: '📮', start: 7, hours: 8, days: [0, 1, 2, 3, 4, 5], wage: 13 },
    look: { body: 0xf2c94c, hairColor: 0x6b4a2f, hairStyle: 'casquette', skin: 0xf6d3b8, legs: 0x2b3a6b, accessory: 'moustache', build: 'fort' } },
  { name: 'Nadia', home: 'F', money: 600, role: 'police',
    street: { title: 'Agente de police', icon: '👮', start: 9, hours: 8, days: [0, 1, 2, 3, 4], wage: 16 },
    look: { body: 0x2b3a6b, hairColor: 0x1c1410, hairStyle: 'chignon', skin: 0xc98e6a, legs: 0x1e2742, accessory: 'aucun' } },
  { name: 'Mme Garnier', home: 'F', money: 5000, role: 'landlord',
    look: { body: 0x9b6ee8, hairColor: 0xdddddd, hairStyle: 'chignon', skin: 0xf6d7c3, legs: 0x3b3b4f, accessory: 'lunettes', outfit: 'veste' } },

  // --- Équipes des commerces et des bureaux ---
  { name: 'Sophie', home: 'E', job: { at: 'O', wage: 16 }, money: 450,
    look: { body: 0xffffff, hairColor: 0xb5651d, hairStyle: 'long', skin: 0xf6d3b8, legs: 0x2b3245, accessory: 'lunettes' } },
  { name: 'Lucas', home: 'D', job: { at: 'O', wage: 15 }, money: 380,
    look: { body: 0x5b8def, hairColor: 0xd9a441, hairStyle: 'court', skin: 0xf1c7a3, legs: 0x2a2f3d, accessory: 'aucun', outfit: 'costume' } },
  { name: 'Emma', home: 'F', job: { at: 'P', wage: 19 }, money: 620,
    look: { body: 0xf08a3c, hairColor: 0x111111, hairStyle: 'tresses', skin: 0x8a5634, legs: 0x3a3a5a, accessory: 'aucun', outfit: 'veste' } },
  { name: 'Nathan', home: 'B', job: { at: 'C', wage: 12 }, money: 190,
    look: { body: 0x333a4a, hairColor: 0x4a3020, hairStyle: 'crete', skin: 0xd9a77e, legs: 0x2a2f3d, accessory: 'aucun' } },
  { name: 'Manon', home: 'E', job: { at: 'R', wage: 12 }, money: 170,
    look: { body: 0xd8504d, hairColor: 0xe8d8b0, hairStyle: 'tresses', skin: 0xf6d7c3, legs: 0x3b3b4f, accessory: 'aucun' } },
  { name: 'Paul', home: 'D', job: { at: 'K', wage: 11 }, money: 200,
    look: { body: 0xffffff, hairColor: 0x7a4a2a, hairStyle: 'chauve', skin: 0xf0c4a0, legs: 0x3a4766, accessory: 'moustache', build: 'fort' } },
  { name: 'Zoé', home: 'B', job: { at: 'L', wage: 11 }, money: 160,
    look: { body: 0xf2c94c, hairColor: 0xd94f9c, hairStyle: 'carre', skin: 0xf1c7a3, legs: 0x2e6b4a, accessory: 'aucun', build: 'mince' } },
  { name: 'Malik', home: 'F', job: { at: 'S', wage: 12 }, money: 230,
    look: { body: 0x3fae73, hairColor: 0x1c1410, hairStyle: 'court', skin: 0x5e3a24, legs: 0x2a2f3d, accessory: 'aucun' } },
  { name: 'Camille', home: 'E', job: { at: 'Y', wage: 13 }, money: 300,
    look: { body: 0xe86a8c, hairColor: 0x2b1d16, hairStyle: 'long', skin: 0xb57a52, legs: 0x323246, accessory: 'solaires', outfit: 'robe' } },
  { name: 'Rayan', home: 'D', job: { at: 'V', wage: 14 }, money: 260,
    look: { body: 0x8a8f99, hairColor: 0x111111, hairStyle: 'casquette', skin: 0x8a5634, legs: 0x3a4766, accessory: 'aucun' } },

  // --- La mairie ---
  { name: 'M. Delorme', home: 'H', job: { at: 'Z', wage: 15 }, money: 1800, role: 'mayor',
    look: { body: 0x2b3245, hairColor: 0xdddddd, hairStyle: 'court', skin: 0xf0c8a8, legs: 0x1e2742, accessory: 'lunettes', outfit: 'costume' } },
  { name: 'Agnès', home: 'H', job: { at: 'Z', wage: 15 }, money: 400,
    look: { body: 0x3cb5c9, hairColor: 0x4a3020, hairStyle: 'chignon', skin: 0xd9a77e, legs: 0x2a2f3d, accessory: 'lunettes', outfit: 'veste' } },
];

export function spawnPeople(world, profile = null) {
  const map = world.map;
  const staff = {}; // un employé sur deux prend l'équipe du soir
  for (const p of PEOPLE) {
    const home = map.byLetter[p.home];
    const start = home.entrances[Math.floor(Math.random() * home.entrances.length)];
    const isPlayer = p.controller === 'player';
    let job = null;
    if (p.job) {
      const n = staff[p.job.at] = (staff[p.job.at] || 0) + 1;
      job = makeJob(map.byLetter[p.job.at], p.job.wage, 0, !isPlayer && n % 2 === 0);
    }
    if (p.street) job = makeStreetJob({ ...p.street, base: map.byLetter.M.id }, 0);
    world.addActor(new Actor({
      name: isPlayer && profile ? profile.name : p.name,
      controller: p.controller,
      look: isPlayer && profile ? { ...p.look, ...profile.look } : p.look,
      home: home.id,
      job,
      role: p.role,
      housing: p.role === 'landlord' ? 'own' : 'rent',
      owned: p.owned ? [...p.owned] : [],
      vehicle: p.vehicle,
      money: p.money,
      energy: isPlayer ? 85 : 60 + Math.random() * 35,
      hunger: isPlayer ? 25 : 10 + Math.random() * 40,
      food: isPlayer ? 1 : Math.floor(Math.random() * 3),
      x: start.x, y: start.y,
    }));
  }
  return world.player;
}
