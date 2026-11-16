import { rel } from './social.js';

// L'État dans le quartier : la mairie, son maire, sa politique (impôts, aides) et les élections municipales.
// Le Trésor public (world.treasury) se remplit avec les impôts et paie les aides et l'indemnité du maire.
// Joueur et PNJ votent, demandent une aide ou se présentent avec les mêmes actions (actions.js).

export const TAX_POLICIES = {
  bas: { label: 'Impôts bas', mul: 0.6, icon: '🟢' },
  normal: { label: 'Impôts normaux', mul: 1, icon: '🟡' },
  haut: { label: 'Impôts hauts', mul: 1.4, icon: '🔴' },
};
export const AID_POLICIES = {
  stricte: { label: 'Aides réduites', amount: 80, icon: '🔒' },
  normale: { label: 'Aides normales', amount: 150, icon: '🤝' },
  genereuse: { label: 'Aides généreuses', amount: 250, icon: '💝' },
};
// Projets que la mairie peut financer avec le Trésor (une fois par semaine au plus)
export const PROJECTS = {
  fete: { label: 'Fête de quartier', icon: '🎉', cost: 1200, mood: 12, news: 'grande fête de quartier sur la place du Marché' },
  fleurs: { label: 'Fleurir les rues', icon: '🌷', cost: 600, mood: 5, news: 'les rues du quartier sont fleuries' },
  prime: { label: 'Prime aux habitants (30 €)', icon: '🎁', cost: 0, each: 30, mood: 4, news: 'une prime de 30 € est versée à chaque habitant' },
};
export const UPKEEP = 6;           // entretien des rues : € par habitant et par semaine
export const MAYOR_PAY = 350;     // indemnité hebdomadaire du maire (payée par le Trésor le lundi)
export const AID_EVERY = 7;        // une aide par semaine au plus
export const CAMPAIGN_FEE = 200;   // caution pour se présenter
const TERM = 14;                   // élections tous les 14 jours
const VOTE_DAYS = 3;               // bureaux de vote ouverts les 3 derniers jours du mandat

export class Government {
  constructor(world) {
    this.w = world;
    world.gov = this;
    const mayor = world.actors.find(a => a.role === 'mayor');
    this.mayor = mayor ? mayor.id : null;
    this.tax = 'normal';
    this.aid = 'normale';
    this.election = TERM;   // jour du dépouillement (le soir)
    this.candidates = [];
    this.votes = {};        // id de l'électeur -> id du candidat
    this.aidPaid = 0;       // aides versées depuis le début
    if (!world.treasury) world.treasury = 2000; // caisses de départ de la ville
    world.on('newDay', () => this.newDay());
  }

  get taxMul() { return TAX_POLICIES[this.tax].mul; }
  get aidAmount() { return AID_POLICIES[this.aid].amount; }
  get mayorActor() { return this.w.actorById(this.mayor); }
  get votingOpen() { return this.w.day > this.election - VOTE_DAYS && this.w.day <= this.election; }
  get campaignOpen() { return this.w.day > this.election - VOTE_DAYS - 2 && this.w.day <= this.election; }

  post(icon, text) { if (this.w.city) this.w.city.post(icon, text); }

  newDay() {
    const w = this.w;
    // Le maire a quitté le quartier : le conseil désigne quelqu'un en attendant
    if (!this.mayorActor) this.appoint();

    // Dépouillement au matin qui suit le dernier jour de vote
    if (w.day === this.election + 1) this.count();

    // Ouverture de la campagne : le maire sortant se représente, un adversaire se déclare
    if (w.day === this.election - VOTE_DAYS - 1) {
      this.candidates = this.mayor ? [this.mayor] : [];
      this.votes = {};
      const rival = this.pickRival();
      if (rival) this.candidates.push(rival.id);
      const names = this.candidates.map(id => w.actorById(id)).filter(Boolean).map(a => a.name).join(' et ');
      this.post('🗳️', `Élections municipales dans ${VOTE_DAYS + 1} jours : ${names} sont candidats. On peut encore se présenter à la mairie.`);
    }
    if (w.day === this.election - VOTE_DAYS + 1) this.post('🗳️', 'Les bureaux de vote sont ouverts à la mairie (3 jours).');

    if (w.weekday === 0) {
      // Entretien des rues et de l'éclairage, payé par la ville
      w.treasury = (w.treasury || 0) - UPKEEP * w.actors.length;
      // Indemnité du maire
      const m = this.mayorActor;
      if (m && (w.treasury || 0) >= MAYOR_PAY) { w.treasury -= MAYOR_PAY; m.money += MAYOR_PAY; }
      // Un maire PNJ ajuste sa politique selon les caisses de la ville
      if (m && !m.isPlayer) this.npcPolicy();
      // Des impôts lourds pèsent sur le moral de tout le monde
      if (this.tax === 'haut') for (const a of w.actors) a.mood = Math.max(0, a.mood - 4);
      if (this.tax === 'bas') for (const a of w.actors) a.mood = Math.min(100, a.mood + 2);
    }
  }

  appoint() {
    const w = this.w;
    const pool = w.actors.filter(a => !a.isPlayer && a.home != null && !['police', 'postman'].includes(a.role));
    const m = pool.sort((x, y) => (y.karma || 0) - (x.karma || 0) || y.money - x.money)[0];
    if (!m) return;
    this.setMayor(m);
    this.post('🏛️', `${m.name} assure l’intérim à la mairie jusqu’aux prochaines élections.`);
  }

  setMayor(a) {
    const old = this.mayorActor;
    if (old && old.role === 'mayor') old.role = null;
    this.mayor = a.id;
    if (!a.role || a.role === 'manager') a.role = 'mayor';
  }

  // Adversaire : quelqu'un de connu et respecté (beaucoup d'amis, bon karma), jamais le joueur
  pickRival() {
    const w = this.w;
    const pool = w.actors.filter(a => !a.isPlayer && a.id !== this.mayor && a.home != null && !['police', 'postman', 'landlord'].includes(a.role));
    const score = a => Object.values(a.relations || {}).reduce((t, v) => t + v, 0) / 20 + (a.karma || 0) * 3 + Math.random() * 10;
    return pool.sort((x, y) => score(y) - score(x))[0] || null;
  }

  // Choix de vote d'un PNJ : on vote pour ceux qu'on aime ; le maire sortant est jugé sur le moral
  choose(a) {
    const w = this.w;
    let best = null, bestScore = -Infinity;
    for (const id of this.candidates) {
      const c = w.actorById(id);
      if (!c) continue;
      let s = rel(a, c) + Math.random() * 25;
      if (id === a.id) s += 1000;
      if (id === this.mayor) {
        s += (a.mood - 50) * 0.6;           // content : on reconduit ; mécontent : on change
        if (this.tax === 'haut') s -= 15;
        if (this.tax === 'bas') s += 8;
        if (a.aidDay != null && w.day - a.aidDay < 14) s += 10; // reconnaissant pour l'aide reçue
      }
      if (s > bestScore) { bestScore = s; best = id; }
    }
    return best;
  }

  count() {
    const w = this.w;
    const tally = {};
    for (const id of this.candidates) tally[id] = 0;
    for (const [voter, c] of Object.entries(this.votes)) if (w.actorById(voter) && tally[c] != null) tally[c]++;
    const order = Object.entries(tally).sort((x, y) => y[1] - x[1] || (x[0] === this.mayor ? -1 : y[0] === this.mayor ? 1 : 0));
    const total = Object.values(tally).reduce((t, v) => t + v, 0);
    const winner = order.length && w.actorById(order[0][0]);
    const result = order.map(([id, n]) => `${w.actorById(id) ? w.actorById(id).name : '?'} ${n}`).join(' · ');
    if (winner) {
      const reelected = winner.id === this.mayor;
      this.setMayor(winner);
      this.post('🏛️', `${reelected ? 'Réélection' : 'Nouveau maire'} : ${winner.name} (${result}, ${total} votants).`);
      const p = w.player;
      if (p) w.emit('electionResult', { actor: p, winner, result, total, reelected, won: winner === p });
    }
    this.candidates = [];
    this.votes = {};
    this.election = w.day - 1 + TERM;
  }

  // Un projet financé par le Trésor (fête, fleurs, prime) : tout le quartier en profite
  project(id) {
    const w = this.w, pr = PROJECTS[id];
    const cost = pr.cost + (pr.each || 0) * w.actors.length;
    if ((w.treasury || 0) < cost) return 'Pas assez dans les caisses';
    w.treasury -= cost;
    for (const a of w.actors) {
      a.mood = Math.min(100, a.mood + pr.mood);
      if (pr.each) a.money += pr.each;
    }
    this.lastProject = w.day;
    const m = this.mayorActor;
    this.post(pr.icon, `${m ? m.name : 'La mairie'} : ${pr.news} (${cost} € du Trésor).`);
    return `${pr.label} : c’est lancé !`;
  }

  npcPolicy() {
    const t = this.w.treasury || 0;
    // Caisses pleines : le maire fait profiter le quartier
    if (this.lastProject == null || this.w.day - this.lastProject >= 7) {
      const n = this.w.actors.length;
      if (t > 6000) this.project('fete');
      else if (t > 3500 + 30 * n) this.project('prime');
      else if (t > 3000) this.project('fleurs');
    }
    const before = `${this.tax}/${this.aid}`;
    if (t > 4000) { this.tax = 'bas'; this.aid = 'genereuse'; }
    else if (t > 1500) { this.tax = 'normal'; this.aid = t > 2500 ? 'genereuse' : 'normale'; }
    else if (t < 400) { this.tax = 'haut'; this.aid = 'stricte'; }
    else { this.tax = 'normal'; this.aid = 'normale'; }
    if (`${this.tax}/${this.aid}` !== before) {
      this.post('📜', `${this.mayorActor.name}, maire : ${TAX_POLICIES[this.tax].label.toLowerCase()}, ${AID_POLICIES[this.aid].label.toLowerCase()}.`);
    }
  }

  // ---------- Sauvegarde ----------
  snapshot() {
    return { mayor: this.mayor, tax: this.tax, aid: this.aid, election: this.election, candidates: this.candidates, votes: this.votes, aidPaid: this.aidPaid, lastProject: this.lastProject ?? null };
  }
  restore(s, day) {
    if (!s) { // vieille sauvegarde : premières élections dans quelques jours
      this.election = Math.ceil((day + 6) / TERM) * TERM;
      return;
    }
    Object.assign(this, { mayor: s.mayor ?? this.mayor, tax: s.tax || 'normal', aid: s.aid || 'normale', election: s.election, candidates: s.candidates || [], votes: s.votes || {}, aidPaid: s.aidPaid || 0, lastProject: s.lastProject ?? null });
    const m = this.mayorActor;
    if (m && !m.role) m.role = 'mayor';
  }
}
