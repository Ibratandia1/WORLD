import { Actor } from './actor.js';
import { makeJob, makeStreetJob } from './jobs.js';

// Habitants de départ. `home` et `job.at` sont des lettres de la carte.
// role : fonction dans le quartier (manager = responsable du lieu de travail, landlord = propriétaire…)
// street : métier de rue (tournée dans le quartier pendant le service)
// En multijoueur, un vrai joueur pourra prendre la place de n'importe lequel.
// ⚠ Toujours ajouter les nouveaux habitants À LA FIN (les sauvegardes retrouvent les gens par leur ordre).
export const PEOPLE = [
  // Le joueur arrive dans le quartier sans logement ni travail, avec un peu d'argent : à lui de choisir où vivre et de trouver un emploi
  { name: 'Toi', controller: 'player', home: null, job: null, money: 450,
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

  // --- Services publics : une première équipe dans chaque lieu ---
  { name: 'Cdt Moreau', home: 'D', job: { at: '1', wage: 18 }, money: 900, education: 2, role: 'police',
    look: { body: 0x2b3a6b, hairColor: 0x7a4a2a, hairStyle: 'court', skin: 0xf1c7a3, legs: 0x1e2742, accessory: 'moustache', build: 'fort' } },
  { name: 'Ophélie', home: 'B', job: { at: '1', wage: 16 }, money: 450, education: 1,
    look: { body: 0x2b3a6b, hairColor: 0x1c1410, hairStyle: 'queue', skin: 0xb57a52, legs: 0x1e2742, accessory: 'aucun' } },
  { name: 'Dr Benali', home: 'F', job: { at: '2', wage: 22 }, money: 2400, education: 3,
    look: { body: 0xffffff, hairColor: 0x1c1410, hairStyle: 'court', skin: 0xb57a52, legs: 0x3a4766, accessory: 'lunettes' } },
  { name: 'Lucie', home: 'E', job: { at: '2', wage: 18 }, money: 600, education: 2,
    look: { body: 0x7fd3c3, hairColor: 0xd9a441, hairStyle: 'chignon', skin: 0xf6d3b8, legs: 0x7fd3c3, accessory: 'aucun' } },
  { name: 'Sgt Diallo', home: 'D', job: { at: '3', wage: 17 }, money: 700, education: 1,
    look: { body: 0xd8504d, hairColor: 0x111111, hairStyle: 'chauve', skin: 0x5e3a24, legs: 0x2a2f3d, accessory: 'aucun', build: 'fort' } },
  { name: 'Mathis', home: 'Q', job: { at: '3', wage: 16 }, money: 380, education: 1,
    look: { body: 0xd8504d, hairColor: 0xb5651d, hairStyle: 'crete', skin: 0xf1c7a3, legs: 0x2a2f3d, accessory: 'aucun' } },
  { name: 'Kevin', home: 'Q', job: { at: '4', wage: 15 }, money: 300, education: 0,
    look: { body: 0x5f6066, hairColor: 0x4a3020, hairStyle: 'casquette', skin: 0xd9a77e, legs: 0x2a2f3d, accessory: 'aucun', build: 'fort' } },
  { name: 'Mme Lefèvre', home: 'H', job: { at: '5', wage: 16 }, money: 800, education: 3,
    look: { body: 0x9b6ee8, hairColor: 0xdddddd, hairStyle: 'carre', skin: 0xf6d7c3, legs: 0x3b3b4f, accessory: 'lunettes' } },
  { name: 'Romain', home: 'I', job: { at: '5', wage: 15 }, money: 350, education: 2,
    look: { body: 0x4bbf8b, hairColor: 0x7a4a2a, hairStyle: 'boucles', skin: 0xf0c4a0, legs: 0x3a4766, accessory: 'aucun' } },
  // --- Justice et banque ---
  { name: 'Juge Lambert', home: 'J', job: { at: '6', wage: 26, title: 'Juge' }, money: 4000, education: 3,
    look: { body: 0x1e1e24, hairColor: 0xdddddd, hairStyle: 'court', skin: 0xf0c8a8, legs: 0x1e1e24, accessory: 'lunettes', outfit: 'costume' } },
  { name: 'Me Haddad', home: 'H', job: { at: '6', wage: 22, title: 'Avocat·e' }, money: 2200, education: 3,
    look: { body: 0x2b3245, hairColor: 0x1c1410, hairStyle: 'chignon', skin: 0xb57a52, legs: 0x2b3245, accessory: 'aucun', outfit: 'veste' } },
  { name: 'Me Rossi', home: 'F', job: { at: '6', wage: 22, title: 'Avocat·e' }, money: 1900, education: 3,
    look: { body: 0x333a4a, hairColor: 0x7a4a2a, hairStyle: 'court', skin: 0xf1c7a3, legs: 0x2a2f3d, accessory: 'aucun', outfit: 'costume' } },
  { name: 'Nicolas', home: 'I', job: { at: '6', wage: 16, title: 'Greffier·ère' }, money: 500, education: 2,
    look: { body: 0x5b8def, hairColor: 0xb5651d, hairStyle: 'boucles', skin: 0xf6d3b8, legs: 0x3a4766, accessory: 'lunettes' } },
  { name: 'M. Fontaine', home: 'D', job: { at: '7', wage: 19, title: 'Conseiller·ère bancaire' }, money: 3000, education: 2,
    look: { body: 0x2f5d4a, hairColor: 0x4a3020, hairStyle: 'court', skin: 0xd9a77e, legs: 0x2a2f3d, accessory: 'aucun', outfit: 'costume' } },
  { name: 'Sarah', home: 'B', job: { at: '7', wage: 15, title: 'Guichetier·ère' }, money: 600, education: 2,
    look: { body: 0xd9b04c, hairColor: 0x111111, hairStyle: 'queue', skin: 0x8a5634, legs: 0x323246, accessory: 'aucun' } },
  // --- Les éboueurs (tournée dans les rues : ils vident les poubelles) ---
  { name: 'Momo', home: 'Q', money: 300, role: 'binman', street: { title: 'Éboueur·se', icon: '🗑️', start: 5, hours: 8, days: [0, 1, 2, 3, 4, 5], wage: 14 },
    look: { body: 0x7fd36f, hairColor: 0x111111, hairStyle: 'casquette', skin: 0x5e3a24, legs: 0x2e6b4a, accessory: 'aucun', build: 'fort' } },
  { name: 'Lina', home: 'Q', money: 260, role: 'binman', street: { title: 'Éboueur·se', icon: '🗑️', start: 13, hours: 8, days: [1, 2, 3, 4, 5, 6], wage: 14 },
    look: { body: 0x7fd36f, hairColor: 0xb5651d, hairStyle: 'queue', skin: 0xf1c7a3, legs: 0x2e6b4a, accessory: 'aucun' } },
  // --- Un peu de délinquance, comme partout ---
  { name: 'Dédé', home: 'Q', job: null, money: 15, karma: -4,
    look: { body: 0x333a4a, hairColor: 0x1c1410, hairStyle: 'casquette', skin: 0xd9a77e, legs: 0x2a2f3d, accessory: 'solaires', outfit: 'sweat', build: 'mince' } },
];

export function spawnPeople(world, profile = null) {
  const map = world.map;
  const staff = {}; // un employé sur deux prend l'équipe du soir
  for (const p of PEOPLE) {
    const home = p.home ? map.byLetter[p.home] : null;
    const from = home || map.buildings.find(b => b.type === 'metro'); // sans logement : on arrive par le métro
    const start = from.entrances[Math.floor(Math.random() * from.entrances.length)];
    const isPlayer = p.controller === 'player';
    let job = null;
    if (p.job) {
      const n = staff[p.job.at] = (staff[p.job.at] || 0) + 1;
      job = makeJob(map.byLetter[p.job.at], p.job.wage, 0, !isPlayer && n % 2 === 0);
      if (p.job.title) job.title = p.job.title;
    }
    if (p.street) job = makeStreetJob({ ...p.street, base: map.byLetter.M.id }, 0);
    world.addActor(new Actor({
      name: isPlayer && profile ? profile.name : p.name,
      controller: p.controller,
      look: isPlayer && profile ? { ...p.look, ...profile.look } : p.look,
      home: home ? home.id : null,
      job,
      role: p.role,
      housing: !home ? null : p.role === 'landlord' ? 'own' : 'rent',
      owned: p.owned ? [...p.owned] : [],
      vehicle: p.vehicle,
      money: p.money,
      education: p.education ?? (p.job ? (p.job.wage >= 18 ? 3 : p.job.wage >= 15 ? 2 : 1) : 1),
      karma: p.karma,
      energy: isPlayer ? 85 : 60 + Math.random() * 35,
      hunger: isPlayer ? 25 : 10 + Math.random() * 40,
      food: isPlayer ? 1 : Math.floor(Math.random() * 3),
      x: start.x, y: start.y,
    }));
  }
  return world.player;
}
