let nextId = 1;

// Un habitant du monde. Le joueur est un acteur comme les autres :
// seul `controller` change ('player', 'ai', et plus tard 'remote' pour le multijoueur).
export class Actor {
  constructor(o) {
    this.id = o.id ?? `a${nextId++}`;
    this.name = o.name;
    this.controller = o.controller || 'ai';
    this.look = o.look;
    this.home = o.home;             // id du bâtiment (null = sans logement)
    this.housing = o.housing || 'rent'; // 'rent' | 'own' | null
    this.rentDue = 0;               // loyer à payer
    this.rentLate = 0;              // jours de retard
    this.job = o.job || null;       // contrat : voir jobs.js
    this.firedDay = null;
    this.lastApply = {};            // id bâtiment -> jour de la dernière candidature
    this.relations = {};            // id acteur -> 0..100
    this.routine = false;           // routine automatique (joueur)

    this.money = o.money ?? 200;
    this.energy = o.energy ?? 80;   // 0..100
    this.hunger = o.hunger ?? 20;   // 0..100 (100 = affamé)
    this.food = o.food ?? 1;        // repas au frigo
    this.mood = o.mood ?? 70;       // moral 0..100 (amis et loisirs le font monter, travail / dettes / solitude baisser)
    this.gifts = {};                // cadeaux en poche (fleurs, chocolats…) : id -> quantité
    this.karma = o.karma ?? 0;
    this.items = {};
    this.owned = o.owned || [];      // achats en boutique (ids du catalogue)
    this.vehicle = o.vehicle || null; // véhicule utilisé dans la rue
    this.role = o.role || null;       // fonction dans le quartier : manager, landlord, police…
    this.referrals = {};              // id bâtiment -> id de la personne qui te recommande
    this.education = o.education ?? 1; // niveau d'études (0–3) : certains métiers en demandent (cours du soir à l'école)
    this.wanted = 0;                  // délits connus de la police (recherché·e si > 0)
    this.sick = false;                // malade (fatigue, moral) : ça passe en 3 jours ou chez le médecin

    this.px = o.x;                  // position sur la grille (décimale pendant la marche)
    this.py = o.y;
    this.path = [];
    this.plan = null;               // action en attente d'arrivée
    this.current = null;            // action en cours
    this.inside = null;             // bâtiment où l'acteur se trouve
    this.facing = 1;
    this.moving = false;
    this.thinkIn = Math.random() * 10;
  }

  get isPlayer() { return this.controller === 'player'; }
  // ⚠ `inside` peut valoir 0 (premier bâtiment) : toujours tester avec `outdoors`, jamais `!inside`.
  get outdoors() { return this.inside == null; }
  // Action réelle en cours (null si l'acteur est juste « sur place »)
  get doing() { return this.current && this.current.id !== 'stay' ? this.current.id : null; }
  get busy() { return !!(this.doing || this.plan || this.path.length); }
}
