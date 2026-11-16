// La vie du quartier : des rendez-vous réguliers sur les places (marché, brocante, concerts, fête de la musique).
// Le calendrier est fixe et lisible (comme dans la vraie vie) ; on y participe avec des actions « sur place »
// (actions.js : market_buy, crepe, brocante_hunt, dance), joueur et PNJ pareil.
// Événements émis : festivalStart / festivalEnd ({ fest })

export const FESTIVALS = [
  {
    id: 'marche', icon: '🧺', name: 'Marché du dimanche', where: 'marche', radius: 4,
    news: 'Ce matin, c’est jour de marché place du Marché : fruits, légumes, fromages et crêpes jusqu’à 13 h.',
    when: (w, h) => w.weekday === 6 && h >= 8 && h < 13,
  },
  {
    id: 'brocante', icon: '🏺', name: 'Brocante de la place des Vosges', where: 'vosges', radius: 4,
    news: 'Brocante place des Vosges aujourd’hui (9 h – 17 h) : chinez, il y a peut-être un trésor !',
    when: (w, h) => w.weekday === 5 && Math.floor((w.day - 1) / 7) % 2 === 0 && h >= 9 && h < 17,
  },
  {
    id: 'concert', icon: '🎻', name: 'Concert sur la place', where: 'vosges', radius: 4,
    news: 'Ce soir, concert gratuit place des Vosges de 19 h à 22 h 30.',
    when: (w, h) => w.weekday === 4 && (w.season === 'printemps' || w.season === 'ete') && h >= 19 && h < 22.5,
  },
  {
    id: 'musique', icon: '🎶', name: 'Fête de la musique', where: 'partout', radius: 99,
    news: 'C’est la fête de la musique ! Des musiciens jouent à tous les coins de rue jusqu’à minuit.',
    when: (w, h) => w.season === 'ete' && ((w.day - 1) % 14) === 6 && h >= 17,
  },
];

export const festById = id => FESTIVALS.find(f => f.id === id);

export class Festivals {
  constructor(world) {
    this.w = world;
    world.festivals = this;
    this.active = new Set();
    this.spots = world.map.places || {};
    this.check(true); // au chargement : sans annonce
  }

  spot(f) { return this.spots[f.where] || null; }
  isOn(id) { return this.active.has(id); }

  // La fête a-t-elle lieu là où se trouve l'acteur ?
  here(a, id) {
    if (!this.active.has(id) || !a.outdoors) return false;
    const f = festById(id), s = this.spot(f);
    if (!s) return f.where === 'partout';
    return Math.hypot(a.px - s.x, a.py - s.y) <= f.radius;
  }

  // Les fêtes en cours où se trouve l'acteur
  around(a) { return [...this.active].filter(id => this.here(a, id)); }

  // Case praticable proche du lieu de la fête (pour s'y rendre)
  target(f) {
    const s = this.spot(f);
    if (!s) return this.w.map.randomFootpath();
    for (let k = 0; k < 20; k++) {
      const x = Math.round(s.x + (Math.random() - 0.5) * f.radius * 1.4), y = Math.round(s.y + (Math.random() - 0.5) * f.radius * 1.4);
      if (this.w.map.walk(x, y)) return { x, y };
    }
    return this.w.map.nearestWalkable(s.x, s.y);
  }

  check(silent = false) {
    const w = this.w, h = w.hour;
    for (const f of FESTIVALS) {
      const on = f.when(w, h);
      if (on && !this.active.has(f.id)) {
        this.active.add(f.id);
        if (w.city && !silent) w.city.post(f.icon, f.news);
        w.emit('festivalStart', { fest: f });
      } else if (!on && this.active.has(f.id)) {
        this.active.delete(f.id);
        w.emit('festivalEnd', { fest: f });
      }
    }
  }

  update() {
    // une vérification par minute de jeu suffit
    const m = Math.floor(this.w.minutes);
    if (m === this.lastMin) return;
    this.lastMin = m;
    this.check();
  }
}
