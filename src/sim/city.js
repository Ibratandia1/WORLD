import { Actor } from './actor.js';
import { weeklyRent, occupants } from './housing.js';
import { openings, shiftNow } from './jobs.js';

// Propreté des rues
const DIRT_PER_ACTOR = 0.0005; // points perdus par minute et par habitant (~40 / jour pour 60 habitants)
const BINMAN_CLEAN = 0.13;     // par minute et par éboueur en tournée, × la saleté (plus c'est sale, plus il y a à ramasser)
export const isBinman = a => !!(a.job && a.job.street && /^Éboueur/.test(a.job.title || ''));

// La ville vivante : les commerces vivent de leurs clients (prix qui bougent, faillites, reprises),
// des habitants arrivent quand il y a du travail et des logements, d'autres partent quand la vie devient trop dure.
// Aucune dépendance à Phaser : tout passe par le monde (événements émis, actions via world.perform côté PNJ).

const RISKY = new Set(['cafe', 'bakery', 'shop']);   // commerces qui peuvent faire faillite
const WEEK = 7;
const FAIL_AVG = 1.5;        // clients par jour en dessous desquels le commerce coule (moyenne sur 7 jours)
const REOPEN_DAYS = [3, 5];  // jours avant qu'un repreneur rouvre le local
export const VAT = 0.15;     // TVA prélevée sur les ventes des commerces (pour la ville)
const HARD_DAYS = 4;        // jours difficiles d'affilée avant de quitter le quartier
const STAY_ROLES = new Set(['police', 'postman', 'landlord', 'mayor', 'binman']);

// Noms de remplacement quand un local est repris (inventés)
const NEW_NAMES = {
  cafe: ['Le Comptoir Bleu', 'Café des Pavés', 'Chez Margot', 'Le Zinc Doré', 'Café Plume', 'Le Bistrot du Coin'],
  bakery: ['Au Pain d’Antan', 'Fournil Sainte-Croix', 'La Mie Câline', 'Boulangerie du Pont'],
  shop: ['Marché Malin', 'Supérette du Temple', 'Épicerie Fine Lila', 'Proxi Pavés'],
};

const FIRST = ['Adam', 'Alice', 'Amir', 'Anaïs', 'Basile', 'Clara', 'Diane', 'Eliott', 'Fatou', 'Gabriel', 'Hana', 'Ilyes',
  'Jade', 'Jules', 'Kenza', 'Louis', 'Lina', 'Maël', 'Mia', 'Nina', 'Noé', 'Océane', 'Omar', 'Pauline', 'Quentin', 'Rose',
  'Salomé', 'Samir', 'Tom', 'Victor', 'Yasmine', 'Zacharie', 'Aya', 'Bilal', 'Célia', 'Dylan', 'Elsa', 'Farid', 'Iris', 'Léon'];

// Apparence au hasard (mêmes valeurs que l'éditeur de personnage)
const pick = a => a[Math.floor(Math.random() * a.length)];
const LOOKS = {
  skin: [0xf6d7c3, 0xf1c7a3, 0xd9a77e, 0xb57a52, 0x8a5634, 0x5e3a24],
  hairColor: [0x1c1410, 0x4a3020, 0x7a4a2a, 0xb5651d, 0xd9a441, 0xe8d8b0, 0xdddddd, 0xd94f9c, 0x5b8def],
  hairStyle: ['court', 'long', 'boucles', 'afro', 'chignon', 'queue', 'carre', 'tresses', 'crete', 'casquette', 'chauve'],
  build: ['mince', 'normal', 'normal', 'fort'],
  body: [0xf2c94c, 0xe86a8c, 0x5b8def, 0x4bbf8b, 0x9b6ee8, 0xf08a3c, 0x3cb5c9, 0xffffff, 0x333a4a, 0xd8504d],
  legs: [0x3a4766, 0x2a2f3d, 0x6b4a2f, 0x8a8f99, 0x2e6b4a, 0xc9b48a],
};
const randomLook = () => ({
  skin: pick(LOOKS.skin), hairColor: pick(LOOKS.hairColor), hairStyle: pick(LOOKS.hairStyle),
  body: pick(LOOKS.body), legs: pick(LOOKS.legs), build: pick(LOOKS.build), accessory: Math.random() < 0.8 ? 'aucun' : pick(['lunettes', 'echarpe', 'moustache', 'solaires']),
});

// Prix pratiqué par un commerce (multiplicateur selon sa clientèle)
export const priceMul = (w, id) => (w.city && w.city.biz[id] ? w.city.biz[id].price : 1);
export const isClosed = (w, id) => !!(w.city && w.city.biz[id] && w.city.biz[id].closed);
export const freeUnits = (w, b) => (b.type === 'home' ? Math.max(0, (b.units || 1) - occupants(w, b).length) : 0);

export class CityLife {
  constructor(world) {
    this.w = world;
    world.city = this;
    this.biz = {};        // id du bâtiment -> { day: {n, sales}, hist: [...], price, closed, reopenDay, since }
    this.news = [];       // nouvelles du quartier pour le journal : { day, icon, text }
    this.gone = [];       // ids des habitants partis (pour les sauvegardes)
    this.born = 0;        // compteur des nouveaux arrivants (ids stables)
    this.arrivalAt = null;
    this.cleanliness = 85; // propreté des rues, 0–100
    for (const b of world.map.buildings) if (b.jobs && b.type !== 'office' && b.type !== 'cityhall') this.biz[b.id] = this.blank(1);

    world.on('done', e => this.onSale(e));
    world.on('newDay', () => this.newDay());
  }

  blank(day) { return { today: { n: 0, sales: 0 }, hist: [], price: 1, closed: false, reopenDay: null, since: day, staffed: 0 }; }

  // Un client payé dans un commerce
  onSale(e) {
    if (!e.def || !e.def.seller || e.where == null || !(e.cost > 0)) return;
    const s = this.biz[e.where];
    if (!s) return;
    s.today.n++;
    s.today.sales += e.cost;
    // TVA : une part de chaque vente revient au Trésor de la ville
    const vat = e.cost * VAT;
    this.w.treasury = (this.w.treasury || 0) + vat;
    this.vatWeek = (this.vatWeek || 0) + vat;
  }

  newDay() {
    const w = this.w;
    // 1. Bilan des commerces
    for (const [id, s] of Object.entries(this.biz)) {
      const b = w.building(+id);
      if (s.closed) {
        if (w.day >= s.reopenDay) this.reopen(b, s);
        continue;
      }
      // Sans équipe, le commerce ne peut pas servir : on ne le juge pas encore (il recrute)
      if (!w.actors.some(a => a.job && a.job.building === b.id)) { s.today = { n: 0, sales: 0 }; continue; }
      s.staffed = (s.staffed || 0) + 1;
      s.hist.push(s.today);
      if (s.hist.length > WEEK) s.hist.shift();
      s.today = { n: 0, sales: 0 };
      const avg = s.hist.reduce((t, d) => t + d.n, 0) / s.hist.length;
      // Les prix suivent la clientèle, une fois par semaine (le lundi)
      // (boutiques et garage vivent surtout de clients de passage : prix fixes)
      if (RISKY.has(b.type) && w.weekday === 0 && s.hist.length >= 3) {
        const old = s.price;
        if (avg > 12) s.price = Math.min(1.3, s.price + 0.05);
        else if (avg < 4) s.price = Math.max(0.8, s.price - 0.05);
        if (s.price !== old) this.post(s.price > old ? '📈' : '🏷️',
          s.price > old ? `${b.name} ne désemplit pas : les prix montent (${Math.round(s.price * 100)} %).` : `${b.name} manque de clients : promotions (${Math.round(s.price * 100)} %).`);
      }
      // Faillite : plus assez de clients pendant une semaine entière
      if (RISKY.has(b.type) && s.hist.length >= WEEK && s.staffed >= 10 && avg < FAIL_AVG) this.close(b, s);
    }

    // 2. Les habitants : départs quand la vie devient trop dure
    for (const a of [...w.actors]) {
      if (a.isPlayer || STAY_ROLES.has(a.role)) continue;
      const hard = a.home == null || a.money < -20 || a.mood < 15;
      a.hardDays = hard ? (a.hardDays || 0) + 1 : 0;
      if (a.hardDays >= HARD_DAYS) this.leave(a);
    }

    // 3. Arrivées : s'il y a du travail et de la place, quelqu'un emménage dans la journée
    this.arrivalAt = null;
    const jobs = w.map.buildings.reduce((t, b) => t + (isClosed(w, b.id) ? 0 : openings(w, b)), 0);
    const homes = w.map.buildings.reduce((t, b) => t + freeUnits(w, b), 0);
    if (homes > 0 && (jobs > 0 || homes > 4) && Math.random() < (jobs >= 3 ? 0.8 : 0.5)) {
      this.arrivalAt = w.minutes + (8 + Math.random() * 9) * 60; // entre 8 h et 17 h
    }
  }

  // Appelé à chaque pas de temps (léger)
  update() {
    if (this.arrivalAt != null && this.w.minutes >= this.arrivalAt) {
      this.arrivalAt = null;
      this.arrive();
    }
    // Propreté : une fois par minute de jeu
    const m = Math.floor(this.w.minutes);
    if (this.lastMin == null) this.lastMin = m;
    const dt = Math.min(60, m - this.lastMin);
    if (dt >= 1) { this.lastMin = m; this.dirt(dt); }
  }

  // ---------- Propreté des rues ----------
  // Les habitants salissent un peu ; les éboueurs en tournée vident les poubelles et nettoient.
  dirt(dt) {
    const w = this.w;
    const before = this.cleanliness;
    let rate = -DIRT_PER_ACTOR * w.actors.length;
    if (w.festivals && w.festivals.active && w.festivals.active.size) rate *= 2; // les fêtes, ça salit
    for (const a of w.actors) if (isBinman(a) && a.outdoors && shiftNow(a.job, w)) rate += BINMAN_CLEAN * (1 - this.cleanliness / 100);
    this.cleanliness = Math.max(0, Math.min(100, this.cleanliness + rate * dt));
    // Rues sales : le moral de ceux qui sont dehors en pâtit
    if (this.cleanliness < 35) for (const a of w.actors) if (a.outdoors) a.mood = Math.max(0, a.mood - 0.006 * dt);
    if (before >= 40 && this.cleanliness < 40) this.post('🗑️', 'Les poubelles débordent dans le quartier. Il manque des éboueurs !');
    if (before < 75 && this.cleanliness >= 75 && this.dirtyNews) this.post('✨', 'Les rues du Marais sont de nouveau propres. Merci aux éboueurs !');
    if (this.cleanliness < 40) this.dirtyNews = true; else if (this.cleanliness >= 75) this.dirtyNews = false;
  }

  clean(n) { this.cleanliness = Math.min(100, this.cleanliness + n); }

  close(b, s) {
    const w = this.w;
    s.closed = true;
    s.reopenDay = w.day + REOPEN_DAYS[0] + Math.floor(Math.random() * (REOPEN_DAYS[1] - REOPEN_DAYS[0] + 1));
    for (const a of w.actors) {
      if (a.job && a.job.building === b.id && !a.job.street) {
        a.job = null;
        if (a.inside === b.id) w.cancel(a, true);
        w.emit('bizClosed', { actor: a, building: b });
      }
    }
    for (const a of w.actors) if (a.inside === b.id) w.cancel(a, true); // tout le monde dehors
    this.post('🔒', `${b.name} a fermé ses portes, faute de clients.`);
  }

  reopen(b, s) {
    const w = this.w;
    const used = new Set(w.map.buildings.map(x => x.name));
    const names = (NEW_NAMES[b.type] || []).filter(n => !used.has(n));
    const old = b.name;
    if (names.length) b.name = pick(names);
    Object.assign(s, this.blank(w.day));
    this.post('🎉', `Nouveau : ${b.name} ouvre à la place de ${old}. On y recrute !`);
    w.emit('bizOpened', { building: b, old });
  }

  arrive() {
    const w = this.w;
    const metro = w.map.buildings.find(b => b.type === 'metro');
    const e = metro ? metro.entrances[Math.floor(Math.random() * metro.entrances.length)] : w.map.randomFootpath();
    const used = new Set(w.actors.map(a => a.name));
    const name = pick(FIRST.filter(n => !used.has(n))) || `Habitant ${this.born + 1}`;
    const a = new Actor({
      id: `n${++this.born}`, name, controller: 'ai', look: randomLook(), home: null, job: null,
      money: Math.round(250 + Math.random() * 450), energy: 70 + Math.random() * 25, hunger: 20 + Math.random() * 30,
      food: 0, x: e.x, y: e.y, education: Math.floor(Math.random() * 3) + (Math.random() < 0.3 ? 1 : 0),
      karma: Math.random() < 0.12 ? -3 : 0, // de temps en temps, quelqu'un de peu recommandable
    });
    a.housing = null;
    a.newcomer = w.day;
    w.addActor(a);
    this.post('🧳', `${name} vient d’emménager dans le quartier.`);
    w.emit('actorAdded', { actor: a });
    return a;
  }

  leave(a) {
    const w = this.w;
    const why = a.home == null ? 'sans logement' : a.money < -20 ? 'criblé·e de dettes' : 'à bout de moral';
    this.post('👋', `${a.name} a quitté le quartier (${why}).`);
    w.removeActor(a);
    if (!String(a.id).startsWith('n')) this.gone.push(a.id);
  }

  post(icon, text) {
    this.seq = (this.seq || 0) + 1;
    this.news.push({ seq: this.seq, day: this.w.day, icon, text });
    if (this.news.length > 30) this.news.shift();
  }

  // Logement libre et abordable pour quelqu'un (les PNJ s'en servent pour décider de louer)
  homeFor(a) {
    const w = this.w;
    const ok = w.map.buildings.filter(b => freeUnits(w, b) > 0 && weeklyRent(b) <= a.money * 0.7);
    ok.sort((x, y) => x.rent - y.rent);
    return ok[0] || null;
  }

  // ---------- Sauvegarde ----------
  snapshot() {
    return {
      biz: this.biz, news: this.news, seq: this.seq || 0, gone: this.gone, born: this.born, arrivalAt: this.arrivalAt,
      cleanliness: this.cleanliness, dirtyNews: !!this.dirtyNews,
      names: Object.fromEntries(this.w.map.buildings.map(b => [b.id, b.name])),
    };
  }

  restore(s) {
    if (!s) return;
    for (const [id, v] of Object.entries(s.biz || {})) if (this.biz[id]) this.biz[id] = { ...this.blank(1), ...v };
    this.news = s.news || [];
    this.seq = s.seq || 0;
    this.gone = s.gone || [];
    this.born = s.born || 0;
    this.arrivalAt = s.arrivalAt ?? null;
    this.cleanliness = s.cleanliness ?? 85;
    this.dirtyNews = !!s.dirtyNews;
    for (const [id, name] of Object.entries(s.names || {})) { const b = this.w.building(+id); if (b) b.name = name; }
  }
}
