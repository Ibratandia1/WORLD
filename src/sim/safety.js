import { near } from './social.js';

// Sécurité du quartier : délits (vol à la tire, vol à l'étalage, cambriolage), police, prison ; incendies et pompiers ;
// maladies. Les gestes eux-mêmes sont des actions (actions.js) : steal, shoplift, burgle, arrest, report, extinguish,
// consult… — joueur et PNJ pareil. Ce module tient les compteurs, le casier et les incendies.
// Événements émis : crime, robbed, arrested, released, fire, fireOut

export const PRISON_DAYS = d => Math.min(3, Math.max(1, d)); // jours de prison selon la gravité
const FIRE_CHANCE = 0.12;   // probabilité par jour qu'un incendie se déclare quelque part
const FIRE_DAMAGE_MIN = 240; // minutes sans pompiers avant les dégâts

export const isPolice = a => !!(a.job && (a.job.title === 'Agent·e de police' || a.role === 'police'));
export const jailed = (w, a) => !!(a.jailUntil && w.minutes < a.jailUntil);
export const onDuty = (w, a, type) => !!(a.job && w.building(a.job.building) && w.building(a.job.building).type === type
  && a.job.days.includes((w.day - 1) % 7) && (() => { const d0 = (w.day - 1) * 1440; return w.minutes >= d0 + (a.job.start - 1) * 60 && w.minutes < d0 + (a.job.start + a.job.hours) * 60; })());

export class Safety {
  constructor(world) {
    this.w = world;
    world.safety = this;
    this.stats = { week: 0, arrests: 0, total: 0 };
    this.fires = {}; // id du bâtiment -> minute de départ
    world.on('newDay', () => this.newDay());
  }

  burning(id) { return this.fires[id] != null; }

  // ---------- Délits ----------
  // Témoins et police autour : chance d'être pris sur le fait
  witnesses(a, victim = null) {
    return this.w.actors.filter(o => o !== a && o !== victim && near(a, o) && o.doing !== 'sleep' && o.doing !== 'sleep_rough');
  }

  // Un délit vient d'être commis : qui a vu ? la police est-elle là ?
  // Renvoie 'arrested' | 'seen' | 'clean'
  report(kind, a, victim, loot) {
    const w = this.w;
    const wit = this.witnesses(a, victim);
    const cop = wit.find(o => isPolice(o) && onDuty(w, o, 'police'));
    this.stats.week++; this.stats.total++;
    a.karma = (a.karma || 0) - 2;
    let outcome = 'clean';
    if (cop && Math.random() < 0.75) outcome = 'arrested';
    else if (Math.random() < 0.15 + 0.15 * wit.length) outcome = 'seen';
    if (outcome !== 'clean') a.wanted = (a.wanted || 0) + 1;
    if (victim) {
      victim.mood = Math.max(0, victim.mood - 8);
      if (outcome !== 'clean' || Math.random() < 0.3) victim.victimOf = a.id; // la victime sait qui c'est
      if (victim.victimOf === a.id) victim.relations[a.id] = Math.max(0, (victim.relations[a.id] || 0) - 30);
      w.emit('robbed', { actor: victim, thief: victim.victimOf === a.id ? a : null, amount: loot, kind });
    }
    w.emit('crime', { actor: a, kind, victim, outcome });
    if (outcome === 'arrested') this.arrest(cop, a, true);
    return outcome;
  }

  // Arrestation (action arrest, ou flagrant délit) : garde à vue puis procès s'il y a un tribunal
  arrest(cop, a, flagrant = false) {
    const w = this.w;
    this.stats.arrests++;
    if (w.justice && w.justice.court) return w.justice.custody(cop, a, flagrant);
    const days = PRISON_DAYS(a.wanted || 1);
    const fine = Math.min(Math.max(0, Math.round(a.money)), 50 * days);
    this.imprison(a, days, fine);
    if (w.city) w.city.post('🚔', `${cop ? cop.name + ' a arrêté' : 'Arrestation de'} ${a.name} : ${days} jour${days > 1 ? 's' : ''} de prison et ${fine} € d’amende.`);
    w.emit('arrested', { actor: a, cop, days, fine });
  }

  // Conduire quelqu'un à la Maison d'arrêt (après un procès, ou directement sans tribunal)
  imprison(a, days, fine) {
    const w = this.w;
    const prison = w.map.buildings.find(b => b.type === 'prison');
    a.money -= fine;
    w.treasury = (w.treasury || 0) + fine;
    a.wanted = 0;
    a.jailUntil = null;
    w.cancel(a, true);
    if (prison) {
      const e = prison.entrances[0];
      a.px = e.x; a.py = e.y;
      a.inside = prison.id;
      a.jailUntil = w.minutes + days * 1440;
      a.current = { id: 'jail', params: {}, remaining: days * 1440, total: days * 1440, buildingId: prison.id, cost: 0 };
    }
  }

  // ---------- Incendies ----------
  startFire(b) {
    const w = this.w;
    if (this.burning(b.id)) return;
    this.fires[b.id] = w.minutes;
    for (const a of w.actors) if (a.inside === b.id) w.cancel(a, true); // tout le monde dehors !
    if (w.city) w.city.post('🔥', `Incendie à ${b.name} ! Les pompiers sont appelés.`);
    w.emit('fire', { building: b });
    // les pompiers de service laissent tout tomber
    for (const a of w.actors) if (onDuty(w, a, 'firestation')) { if (a.doing === 'work') w.cancel(a); a.thinkIn = 0; }
  }

  putOut(b, by = null) {
    const w = this.w;
    if (!this.burning(b.id)) return;
    delete this.fires[b.id];
    if (w.city) w.city.post('🚒', by ? `${by.name} et les pompiers ont éteint l’incendie de ${b.name}.` : `L’incendie de ${b.name} est enfin éteint, mais les dégâts sont importants.`);
    w.emit('fireOut', { building: b, by });
  }

  update() {
    const w = this.w;
    for (const [id, since] of Object.entries(this.fires)) {
      if (w.minutes - since < FIRE_DAMAGE_MIN) continue;
      // Personne n'est venu : dégâts (commerce fermé quelques jours, habitants démoralisés)
      const b = w.building(+id);
      const biz = w.city && w.city.biz[b.id];
      if (biz && !biz.closed) { biz.closed = true; biz.reopenDay = w.day + 2; }
      for (const a of w.actors) if (a.home === b.id) a.mood = Math.max(0, a.mood - 15);
      this.putOut(b, null);
    }
    // Sortie de prison
    for (const a of w.actors) {
      if (a.jailUntil && w.minutes >= a.jailUntil) {
        a.jailUntil = null;
        if (a.current && a.current.id === 'jail') w.stay(a, a.current.buildingId);
        w.emit('released', { actor: a });
      }
    }
  }

  newDay() {
    const w = this.w;
    if (w.weekday === 0) this.stats.week = 0;
    // Un incendie de temps en temps (plus souvent l'hiver : chauffages)
    if (Math.random() < FIRE_CHANCE * (w.season === 'hiver' ? 1.6 : 1)) {
      const list = w.map.buildings.filter(b => ['home', 'cafe', 'bakery', 'shop', 'fashion', 'office'].includes(b.type) && !this.burning(b.id));
      const b = list[Math.floor(Math.random() * list.length)];
      if (b) this.fireAt = { id: b.id, at: w.minutes + (7 + Math.random() * 14) * 60 };
    }
  }

  tick() {
    if (this.fireAt && this.w.minutes >= this.fireAt.at) { const b = this.w.building(this.fireAt.id); this.fireAt = null; this.startFire(b); }
    this.update();
  }

  snapshot() { return { stats: this.stats, fires: this.fires, fireAt: this.fireAt || null }; }
  restore(s) { if (!s) return; this.stats = s.stats || this.stats; this.fires = s.fires || {}; this.fireAt = s.fireAt || null; }
}
