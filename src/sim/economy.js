// Économie du quartier (world.economy) : les commerces ont une trésorerie, le marché du travail et celui du
// logement bougent tout seuls. Simulation pure, mêmes règles pour le joueur et les PNJ.
//
// • Commerces (café, boulangerie, supérette, mode, garage) : chaque jour, recettes (les ventes réelles + la
//   clientèle de passage, selon l'heure de pointe, la saison et la météo) − salaires − marchandises − loyer du local.
//   Trésorerie en baisse plusieurs jours : gel des embauches puis licenciement du dernier arrivé. Les affaires
//   marchent : on réembauche, primes (+1 €/h), salaire proposé en hausse quand un poste ne trouve personne.
// • Logement : chaque lundi, loyer de chaque immeuble selon les logements libres (plein → +4 %, vide → −5 %).
// • Prix : un petit indice (cpi) suit la tension du marché du travail (plein emploi → les prix montent un peu).
import { POSITIONS, positionsOf, posOf, freeSlots } from './jobs.js';
import { occupants } from './housing.js';

const COMMERCE = new Set(['cafe', 'bakery', 'shop', 'fashion', 'garage', 'gym']);
const CLIENT_SCALE = 6;   // un client simulé ≈ 6 vrais clients (la plupart des passants ne sont pas dessinés)
const PASSING = { cafe: 260, bakery: 240, shop: 300, fashion: 200, garage: 420, gym: 300 }; // clientèle de passage (€/jour, moyenne ; garage : réparations)
const GOODS = { cafe: 0.3, bakery: 0.25, shop: 0.55, fashion: 0.45, garage: 0.4, gym: 0.1 }; // part des recettes en marchandises
const FIXED = 70;         // loyer du local, énergie… (€/jour)
const START_CASH = 2500;

export class Economy {
  constructor(world) {
    this.w = world;
    world.economy = this;
    this.cash = {};      // trésorerie de chaque commerce
    this.trend = {};     // résultats des derniers jours
    this.payroll = {};   // salaires versés aujourd'hui
    this.cuts = {};      // places supprimées (gel / licenciements)
    this.bonus = {};     // supplément au salaire proposé à l'embauche
    this.vacantDays = {};
    this.cpi = 1;
    this.lastResult = {};
    for (const b of world.map.buildings) if (COMMERCE.has(b.type)) this.cash[b.id] = START_CASH;
    world.on('newDay', () => this.newDay());
    this.assignPositions();
  }

  paid(bid, amount) { if (this.cash[bid] != null) this.payroll[bid] = (this.payroll[bid] || 0) + amount; }
  cut(bid) { return this.cuts[bid] || 0; }
  wageBonus(bid) { return this.bonus[bid] || 0; }
  health(bid) { // pour l'interface : 'good' | 'ok' | 'bad' | null
    if (this.cash[bid] == null) return null;
    const c = this.cash[bid], r = this.lastResult[bid] || 0;
    return c > 4000 && r >= 0 ? 'good' : c < 800 || (r < 0 && c < 1800) ? 'bad' : 'ok';
  }

  // Anciens contrats sans poste : chacun garde sa place, rangé dans les postes du lieu (sans condition : il est déjà là)
  assignPositions() {
    const w = this.w;
    for (const b of w.map.buildings) {
      if (!POSITIONS[b.type] || !b.jobs) continue;
      const list = positionsOf(b);
      const staff = w.actors.filter(a => a.job && a.job.building === b.id && !a.job.pos);
      if (!staff.length) continue;
      const left = Object.fromEntries(list.map(p => [p.id, p.slots - w.actors.filter(a => a.job && a.job.building === b.id && a.job.pos === p.id).length]));
      // d'abord ceux dont l'intitulé correspond à un poste, puis les autres dans l'ordre des postes
      for (const a of [...staff].sort((x, y) => (list.some(p => p.title === y.job.title) ? 1 : 0) - (list.some(p => p.title === x.job.title) ? 1 : 0))) {
        const p = list.find(p => p.title === a.job.title && left[p.id] > 0) || list.find(p => left[p.id] > 0) || list[0];
        a.job.pos = p.id; a.job.title = a.job.street && b.type === 'police' && p.id === 'agent' ? 'Agent·e de police' : p.title;
        left[p.id]--;
      }
    }
  }

  newDay() {
    const w = this.w, city = w.city;
    this.assignPositions();
    const season = w.season || 'printemps';
    const rainy = w.weather === 'rain' || w.weather === 'snow';
    for (const id of Object.keys(this.cash)) {
      const b = w.building(+id);
      const biz = city && city.biz[id];
      if (!b || !biz || biz.closed) { this.payroll[id] = 0; continue; }
      const staff = w.actors.filter(a => a.job && a.job.building === b.id);
      if (!staff.length) { this.payroll[id] = 0; continue; } // pas encore d'équipe : rien n'est compté
      const day = biz.hist[biz.hist.length - 1] || { n: 0, sales: 0 };
      // clientèle de passage : plus en été pour les cafés (terrasses), moins sous la pluie ; un peu de hasard
      let passing = PASSING[b.type] * (0.75 + Math.random() * 0.5) * (rainy ? 0.75 : 1) * biz.price ** -0.6;
      if (b.type === 'cafe' && season === 'ete') passing *= 1.25;
      if (b.type === 'cafe' && season === 'hiver') passing *= 0.85;
      // une adresse fréquentée attire du monde (les vrais clients du jour comptent beaucoup)
      // (mode et garage : peu d'achats mais gros paniers, la fréquentation simulée compte moins)
      const footfall = b.type === 'garage' || b.type === 'fashion' ? 1 : Math.min(1.5, 0.6 + day.n / 10);
      const revenue = day.sales * CLIENT_SCALE + passing * footfall;
      const costs = (this.payroll[id] || 0) + revenue * GOODS[b.type] + FIXED;
      const result = revenue - costs;
      this.payroll[id] = 0;
      this.cash[id] += result;
      this.lastResult[id] = Math.round(result);
      const tr = this.trend[id] = [...(this.trend[id] || []), result].slice(-5);
      const losing = tr.length >= 3 && tr.slice(-3).every(r => r < 0);
      // Difficultés : on supprime une place (gel), puis on licencie le dernier arrivé si l'équipe est trop nombreuse
      if (this.cash[id] < 600 && losing && this.cut(id) < b.jobs.slots - 1) {
        this.cuts[id] = this.cut(id) + 1;
        const entry = positionsOf(b)[0];
        const inEntry = staff.filter(a => posOf(w, a.job)?.id === entry.id).sort((x, y) => (y.job.since || 0) - (x.job.since || 0));
        if (inEntry.length > Math.max(0, entry.slots - this.cut(id)) && inEntry.length > 0) {
          const out = inEntry[0];
          out.job = null; out.firedDay = w.day;
          if (out.inside === b.id) w.cancel(out, true);
          w.emit('laidOff', { actor: out, building: b });
          this.post('📉', `${b.name} traverse une passe difficile : ${out.name} est licencié·e.`);
        } else this.post('📉', `${b.name} gèle ses embauches : les affaires sont calmes.`);
        this.trend[id] = [];
      }
      // Les affaires reprennent : on rouvre une place
      if (this.cut(id) > 0 && this.cash[id] > 3200 && tr.slice(-2).every(r => r > 0)) {
        this.cuts[id]--;
        this.post('📈', `${b.name} va mieux et recrute à nouveau.`);
      }
      // Affaires florissantes et clientèle nombreuse : le commerce s'agrandit (une place de plus)
      const avgN = biz.hist.length ? biz.hist.reduce((t, d) => t + d.n, 0) / biz.hist.length : 0;
      if (this.cut(id) === 0 && this.cash[id] > 9000 && avgN > 15 && biz.hist.length >= 5) {
        this.cuts[id] = -1;
        this.post('🏗️', `${b.name} marche si bien qu’il agrandit son équipe : un poste de plus !`);
      }
      // Très bonne santé : prime pour l'équipe (+1 €/h, plafonnée), payée sur la trésorerie
      if (this.cash[id] > 7000 && w.weekday === 4) {
        let n = 0;
        for (const a of staff) if (a.job.wage < Math.round((a.job.baseWage || a.job.wage) * 1.4)) { a.job.wage += 1; n++; w.emit('raise', { actor: a, wage: a.job.wage }); }
        if (n) { this.cash[id] -= 600; this.post('💶', `Belle saison pour ${b.name} : augmentation pour toute l’équipe !`); }
      }
    }

    // Marché du travail : un poste qui reste vide fait monter le salaire proposé ; pourvu, l'offre revient à la normale
    let open = 0;
    for (const b of w.map.buildings) {
      if (!POSITIONS[b.type] || !b.jobs) continue;
      const free = positionsOf(b)[0] ? freeSlots(w, b, positionsOf(b)[0].id) : 0;
      open += free;
      if (free > 0) {
        this.vacantDays[b.id] = (this.vacantDays[b.id] || 0) + 1;
        if (this.vacantDays[b.id] % 4 === 0 && this.wageBonus(b.id) < 3) {
          this.bonus[b.id] = this.wageBonus(b.id) + 1;
          this.post('💼', `${b.name} peine à recruter : salaire d’embauche relevé (+${this.bonus[b.id]} €/h).`);
        }
      } else { this.vacantDays[b.id] = 0; this.bonus[b.id] = 0; }
    }
    const adults = w.actors.filter(a => a.role !== 'landlord' && a.role !== 'mayor').length;
    const jobless = w.actors.filter(a => !a.job && a.role !== 'landlord' && a.role !== 'mayor').length;
    this.unemployment = adults ? jobless / adults : 0;
    this.openJobs = open;

    // Lundi : loyers selon l'offre et la demande, petit indice des prix
    if (w.weekday === 0) {
      const homeless = w.actors.filter(a => a.home == null).length;
      let up = 0, down = 0;
      for (const b of w.map.buildings) {
        if (b.type !== 'home') continue;
        const units = b.units || 1, free = Math.max(0, units - occupants(w, b).length);
        const old = b.rentMul || 1;
        if (free === 0 && homeless > 0) b.rentMul = Math.min(1.5, old * 1.04);
        else if (free / units >= 0.5) b.rentMul = Math.max(0.7, old * 0.95);
        if ((b.rentMul || 1) > old) up++; else if ((b.rentMul || 1) < old) down++;
      }
      if (up > down + 2) this.post('🏠', 'Les logements se font rares : les loyers augmentent.');
      else if (down > up + 2) this.post('🔑', 'Beaucoup de logements libres : les loyers baissent.');
      const tension = 0.12 - this.unemployment; // plein emploi → les prix montent ; chômage → ils se tassent
      this.cpi = Math.max(0.9, Math.min(1.4, this.cpi * (1 + 0.002 + tension * 0.02)));
    }
  }

  post(icon, text) { if (this.w.city) this.w.city.post(icon, text); }

  snapshot() {
    return {
      cash: this.cash, trend: this.trend, cuts: this.cuts, bonus: this.bonus, vacantDays: this.vacantDays, cpi: this.cpi,
      lastResult: this.lastResult, rents: Object.fromEntries(this.w.map.buildings.filter(b => b.rentMul).map(b => [b.id, b.rentMul])),
    };
  }

  restore(s) {
    if (!s) { this.assignPositions(); return; }
    for (const [id, v] of Object.entries(s.cash || {})) if (this.cash[id] != null) this.cash[id] = v;
    Object.assign(this, { trend: s.trend || {}, cuts: s.cuts || {}, bonus: s.bonus || {}, vacantDays: s.vacantDays || {}, cpi: s.cpi || 1, lastResult: s.lastResult || {} });
    for (const [id, m] of Object.entries(s.rents || {})) { const b = this.w.building(+id); if (b) b.rentMul = m; }
    this.assignPositions();
  }
}
