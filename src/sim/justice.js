import { PRISON_DAYS } from './safety.js';

// Justice : après une arrestation, garde à vue au commissariat puis procès au Tribunal du Marais
// (le lendemain à 10 h, en semaine). Un jury de 3 habitants tirés au sort vote ; un·e avocat·e engagé·e
// (action hire_lawyer) pèse lourd dans la balance. Coupable → Maison d'arrêt + amende ; sinon, relaxe.
// Les jurés touchent une indemnité du Trésor. Joueur et PNJ suivent les mêmes règles (actions hire_lawyer, jury_vote).
// Événements émis : custody, jurySummons, verdict, juryDone

export const LAWYER_FEE = 120;
export const JUROR_PAY = 30;
const TRIAL_HOUR = 10;

export const isLawyer = a => !!(a.job && a.job.title === 'Avocat·e');

export class Justice {
  constructor(world) {
    this.w = world;
    world.justice = this;
    this.stats = { trials: 0, guilty: 0, acquitted: 0 };
  }

  get court() { return this.w.map.buildings.find(b => b.type === 'court'); }

  // Prochaine audience : le lendemain (ou le lundi suivant) à 10 h
  trialTime() {
    const w = this.w;
    let d = w.day + 1;
    while (((d - 1) % 7) > 4) d++; // pas d'audience le week-end
    return (d - 1) * 1440 + TRIAL_HOUR * 60;
  }

  // Arrestation : garde à vue au commissariat en attendant le procès
  custody(cop, a, flagrant) {
    const w = this.w;
    const station = w.map.buildings.find(b => b.type === 'police');
    const at = this.trialTime();
    const pool = w.actors.filter(o => o !== a && o !== cop && !o.trial && !(o.jailUntil && w.minutes < o.jailUntil)
      && !(o.job && w.building(o.job.building) && w.building(o.job.building).type === 'court'));
    const jury = [];
    while (jury.length < 3 && pool.length) jury.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
    a.trial = { at, charges: Math.max(1, a.wanted || 1), flagrant: !!flagrant, lawyer: null, jury, votes: {}, by: cop ? cop.id : null };
    a.wanted = 0;
    w.cancel(a, true);
    if (station) {
      const e = station.entrances[0];
      a.px = e.x; a.py = e.y; a.inside = station.id;
      a.jailUntil = at + 60;
      const left = a.jailUntil - w.minutes;
      a.current = { id: 'jail', params: {}, remaining: left, total: left, buildingId: station.id, cost: 0 };
    }
    if (w.city) w.city.post('🚔', `${cop ? cop.name + ' a arrêté' : 'Arrestation de'} ${a.name}. Garde à vue, puis procès au Tribunal.`);
    w.emit('custody', { actor: a, cop, at });
    // Un PNJ qui en a les moyens appelle un·e avocat·e (même action que le joueur)
    if (a.controller === 'ai' && a.money >= LAWYER_FEE + 30 && Math.random() < 0.7) w.perform(a, 'hire_lawyer');
    for (const id of jury) {
      const j = w.actorById(id);
      if (j) w.emit('jurySummons', { actor: j, accused: a, at });
    }
  }

  // Un juré donne son avis (action jury_vote)
  vote(juror, accused, guilty) { accused.trial.votes[juror.id] = !!guilty; }

  // Avis d'un juré PNJ : les preuves, son lien avec l'accusé, son propre caractère
  npcVote(j, a, t) {
    let p = 0.42 + (t.flagrant ? 0.28 : 0) + 0.08 * (t.charges - 1) - (t.lawyer ? 0.3 : 0);
    p -= ((j.relations && j.relations[a.id]) || 0) / 220;
    if ((j.karma || 0) < 0) p -= 0.1;
    if (a.victimOf === j.id || j.victimOf === a.id) p += 0.3;
    return Math.random() < p;
  }

  judge(a) {
    const w = this.w, t = a.trial;
    let yes = 0, no = 0;
    for (const id of t.jury) {
      const j = w.actorById(id);
      if (!j) continue;
      const g = t.votes[id] != null ? t.votes[id] : this.npcVote(j, a, t);
      if (g) yes++; else no++;
      // indemnité de juré (Trésor de la ville)
      j.money += JUROR_PAY; w.treasury = (w.treasury || 0) - JUROR_PAY;
    }
    const guilty = yes > no || (yes === no && t.flagrant && !t.lawyer);
    a.trial = null;
    a.jailUntil = null;
    this.stats.trials++;
    const lawyer = t.lawyer != null ? w.actorById(t.lawyer) : null;
    if (guilty) {
      this.stats.guilty++;
      const days = PRISON_DAYS(t.charges);
      const fine = Math.min(Math.max(0, Math.round(a.money)), 50 * days);
      w.safety.imprison(a, days, fine);
      if (w.city) w.city.post('⚖️', `Procès de ${a.name} : coupable (${yes} voix contre ${no}). ${days} jour${days > 1 ? 's' : ''} de prison et ${fine} € d’amende.`);
      w.emit('verdict', { actor: a, guilty, yes, no, days, fine, lawyer });
    } else {
      this.stats.acquitted++;
      a.karma = (a.karma || 0) + 1;
      if (a.current && a.current.id === 'jail') w.stay(a, a.current.buildingId);
      if (w.city) w.city.post('⚖️', `Procès de ${a.name} : relaxé·e (${no} voix contre ${yes})${lawyer ? `, bien défendu·e par ${lawyer.name}` : ''}.`);
      w.emit('verdict', { actor: a, guilty, yes, no, days: 0, fine: 0, lawyer });
    }
    for (const id of t.jury) { const j = w.actorById(id); if (j) w.emit('juryDone', { actor: j, accused: a, guilty }); }
  }

  tick() {
    const w = this.w;
    for (const a of w.actors) if (a.trial && w.minutes >= a.trial.at) this.judge(a);
  }

  snapshot() { return { stats: this.stats }; }
  restore(s) { if (s && s.stats) this.stats = s.stats; }
}
