import { isWorkday, shiftOf, todayLog, openings, fmtShift, DAY_SHORT, MAX_WARNINGS } from './jobs.js';
import { rel, nearby, managerOf, roleOf } from './social.js';

const bossName = (w, a) => { const m = managerOf(w, a); return m ? `${m.name}, ton responsable,` : 'Ton responsable'; };
const landlordName = w => { const l = roleOf(w, 'landlord'); return l ? l.name : 'Ton propriétaire'; };
import { nextShiftText } from './actions.js';

// Les décisions arrivent par événements, et chaque événement naît d'une situation réelle :
// l'heure, le lieu, la météo, les besoins, le travail, le loyer, les gens autour.
// Chaque choix déclenche une action de actions.js (via world.perform).
//
// Champs : id, icon, title, text, choices — chacun peut être une fonction (a, w, ctx)
//   when(a, w, director) => ctx (objet ou true) si la situation est réunie, sinon null
//   urgent   passe avant le délai minimal entre deux événements
//   chance   probabilité, tirée une seule fois par jour quand la situation se présente
//   cooldown minutes avant de pouvoir revenir · once: 'day'

const OK = [{ icon: '👌', label: 'D’accord' }];
const sleepChoice = a => (a.home != null
  ? { icon: '😴', label: 'Rentrer dormir', action: 'sleep' }
  : { icon: '🥶', label: 'Dormir au métro', action: 'sleep_rough' });
const awake = o => o.doing !== 'sleep' && o.doing !== 'sleep_rough';
const npcsNear = (w, a) => nearby(w, a).filter(o => o.controller !== 'player');
const nearGrass = (w, a) => {
  const x = Math.round(a.px), y = Math.round(a.py);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const t = w.map.tiles[y + dy] && w.map.tiles[y + dy][x + dx];
    if (t && t.ground === 'grass') return true;
  }
  return false;
};

export const EVENTS = [
  // ---------- Urgences ----------
  {
    id: 'malaise', urgent: true, icon: '😵', title: 'Tu tiens à peine debout', cooldown: 240,
    text: 'Ton énergie est à zéro. Il faut te reposer.',
    when: a => a.energy <= 1 && !a.doing,
    choices: a => [sleepChoice(a)],
  },
  {
    id: 'retard', urgent: true, icon: '📞', once: 'day',
    title: (a, w) => `${bossName(w, a)} appelle`.replace(', appelle', ' appelle'),
    text: a => `« Tu devais commencer à ${a.job.start}h. On t’attend ! »`,
    when: (a, w) => {
      if (!a.job || a.job.street || !isWorkday(a.job, w.day)) return null;
      const s = shiftOf(a.job, w.day), log = todayLog(a.job, w.day);
      const coming = a.doing === 'work' || (a.plan && a.plan.id === 'work');
      return !coming && !log.excused && log.arrived == null && w.minutes > s.start + 20 && w.minutes < s.end - 60;
    },
    choices: [
      { icon: '💼', label: 'J’arrive !', action: 'work' },
      { icon: '🤒', label: 'Je suis malade', action: 'call_sick' },
      { icon: '🙈', label: 'Ignorer l’appel' },
    ],
  },

  // ---------- Travail ----------
  {
    id: 'reveil', icon: '⏰', title: 'Le réveil sonne', once: 'day',
    text: (a, w) => `Tu commences à ${a.job.start}h chez ${w.building(a.job.building).name}.`,
    when: (a, w) => {
      if (!a.job || a.routine || a.doing || !isWorkday(a.job, w.day)) return null;
      if (a.inside == null || a.inside !== a.home) return null;
      const s = shiftOf(a.job, w.day);
      return w.minutes >= s.start - 100 && w.minutes < s.start - 15;
    },
    choices: [
      { icon: '💼', label: 'Partir au travail', action: 'work' },
      { icon: '☕', label: 'Un café d’abord', action: 'coffee' },
      { icon: '🛋️', label: 'Encore une heure', action: 'nap' },
    ],
  },
  {
    id: 'heures_sup', icon: '⏳', title: 'Heures sup ?', once: 'day', chance: 0.35,
    text: 'Ton responsable te demande de rester deux heures de plus, payées 25 % de plus.',
    when: (a, w) => a.doing === 'work' && shiftOf(a.job, w.day).end - w.minutes < 40,
    choices: [
      { icon: '⏳', label: 'Rester 2 h', action: 'overtime' },
      { icon: '🏠', label: 'Refuser poliment' },
    ],
  },

  // ---------- Besoins ----------
  {
    id: 'faim', icon: '🍽️', title: 'Ton ventre gargouille', cooldown: 180,
    text: 'Il serait temps de manger quelque chose.',
    when: a => a.hunger > 72 && !a.doing && !a.routine,
    choices: a => [
      { icon: '🥐', label: 'Sandwich à la boulangerie', action: 'eat_bakery' },
      { icon: '🍽️', label: 'Déjeuner au café', action: 'eat_cafe' },
      ...(a.home != null ? [{ icon: '🍝', label: 'Cuisiner à la maison', action: 'eat_home' }] : []),
    ],
  },
  {
    id: 'fatigue', icon: '🥱', title: 'Coup de fatigue', cooldown: 180,
    text: 'Tes paupières sont lourdes.',
    when: a => a.energy < 22 && !a.doing && !a.routine,
    choices: a => [sleepChoice(a), { icon: '☕', label: 'Un café serré', action: 'coffee' }, { icon: '💪', label: 'Tenir bon' }],
  },
  {
    id: 'dette', icon: '📉', title: 'Compte à découvert', cooldown: 1440,
    text: 'Ta banque t’envoie un message inquiet. Il va falloir travailler et dépenser moins.',
    when: a => a.money < 0,
    choices: OK,
  },

  // ---------- Les gens ----------
  {
    // Rare : seulement des amis, pas plus d'une fois tous les 3 jours par personne
    id: 'salut', icon: '👋', cooldown: 720, chance: 0.25,
    when: (a, w, d) => (a.doing ? null : npcsNear(w, a).find(o => awake(o) && rel(a, o) >= 30 && !o.doing && (d.met[o.id] == null || w.day - d.met[o.id] >= 3)) || null),
    onFire: (a, w, o, d) => { d.met[o.id] = w.day; },
    title: (a, w, o) => (rel(a, o) < 10 ? `${o.name} te fait un signe` : `${o.name} est là`),
    text: (a, w, o) => (rel(a, o) < 10
      ? 'Un visage que tu croises souvent dans le quartier.'
      : `« Salut ${a.name} ! Ça va ? »`),
    choices: (a, w, o) => [
      { icon: '💬', label: 'Discuter', action: 'talk', params: { who: o.id } },
      { icon: '👋', label: 'Saluer de loin', action: 'wave', params: { who: o.id } },
    ],
  },
  {
    id: 'invitation', icon: '🍽️', title: 'Invitation à déjeuner', cooldown: 2880, chance: 0.3,
    when: (a, w) => {
      if (a.doing || w.hour < 11.5 || w.hour >= 14) return null;
      return w.actors.find(o => o !== a && o.controller !== 'player' && rel(a, o) >= 30 && !o.doing) || null;
    },
    text: (a, w, o) => `${o.name} : « On déjeune ensemble au café ? »`,
    choices: (a, w, o) => [
      { icon: '🍽️', label: 'Avec plaisir', action: 'eat_cafe', params: { with: o.id } },
      { icon: '😅', label: 'Pas aujourd’hui' },
    ],
  },
  {
    id: 'tuyau', icon: '💡', title: 'Un tuyau', cooldown: 2880,
    when: (a, w) => {
      if (a.job) return null;
      for (const o of w.actors) {
        if (o === a || !o.job || rel(a, o) < 20) continue;
        const b = w.building(o.job.building);
        if (openings(w, b) > 0) return { o, b };
      }
      return null;
    },
    text: (a, w, { o, b }) => `${o.name} : « ${b.name} recrute à ${b.jobs.wage} €/h. Passe postuler, je dirai du bien de toi ! »`,
    choices: (a, w, { b }) => [
      { icon: '📝', label: 'Aller postuler', action: 'apply', params: { building: b.id } },
      { icon: '🙂', label: 'Merci, plus tard' },
    ],
  },

  // ---------- La rue ----------
  {
    id: 'musicien', icon: '🎻', title: 'Musicien de rue', cooldown: 1440, chance: 0.6,
    text: 'Un violoniste joue près du parc. Quelques passants s’arrêtent.',
    when: (a, w) => a.outdoors && w.hour >= 10 && w.hour < 20 && nearGrass(w, a),
    choices: [{ icon: '🎵', label: 'Donner 2 €', action: 'tip' }, { icon: '🚶', label: 'Passer son chemin' }],
  },
  {
    id: 'portefeuille', icon: '👛', title: 'Un portefeuille par terre', cooldown: 4320,
    text: 'Il contient 40 € et une carte d’identité.',
    when: a => a.outdoors && a.path.length > 0 && Math.random() < 0.002,
    choices: [{ icon: '👮', label: 'Le rapporter', action: 'return_wallet' }, { icon: '🤫', label: 'Garder l’argent', action: 'keep_wallet' }],
  },
  {
    id: 'pluie', icon: '🌧️', title: 'Il pleut des cordes', cooldown: 600,
    text: 'Un vendeur de parapluies surgit au coin de la rue.',
    when: (a, w) => w.weather === 'rain' && a.outdoors && a.path.length > 0 && !a.items.umbrella,
    choices: [{ icon: '☂️', label: 'Acheter un parapluie', action: 'buy_umbrella' }, { icon: '🏃', label: 'Courir sous la pluie' }],
  },
  {
    id: 'grattage', icon: '🎟️', title: 'À la caisse', cooldown: 1440,
    when: (a, w) => {
      if (a.inside == null || a.doing || w.building(a.inside).type !== 'shop') return null;
      return w.actors.find(o => o !== a && o.inside === a.inside && o.doing === 'work') || null;
    },
    text: (a, w, o) => `${o.name} : « Un ticket à gratter ? Le gros lot est à 200 € ! »`,
    choices: [{ icon: '🎟️', label: 'Acheter un ticket', action: 'scratch' }, { icon: '🙅', label: 'Non merci' }],
  },
];

// Conséquences annoncées par le monde (avertissement, renvoi, loyer…)
const REASONS = {
  absence: 'Tu ne t’es pas présenté·e au travail.',
  retard: 'Tu es arrivé·e en retard.',
  'départ anticipé': 'Tu es parti·e bien avant la fin de ton service.',
};
const PUSHED = {
  jobWarning: (a, w, e) => ({
    icon: '⚠️', title: `Avertissement ${e.warnings}/${MAX_WARNINGS}`,
    text: `${managerOf(w, a) ? managerOf(w, a).name + ' : « ' : ''}${REASONS[e.reason]}${managerOf(w, a) ? ' »' : ''} Au ${MAX_WARNINGS}e avertissement, c’est le renvoi.`, choices: OK,
  }),
  caught: (a, w, e) => ({
    icon: '👮', title: `${e.cop.name} t’a vu·e`,
    text: `« Garder un portefeuille trouvé, c’est du vol. Ce sera une amende de 90 €. »`,
    choices: [{ icon: '👮', label: 'Payer l’amende', action: 'pay_fine' }],
  }),
  taxBill: (a, w, e) => ({
    icon: '🏛️', title: 'Impôts de la semaine',
    text: [
      e.income ? `${e.income} € d’impôt sur le revenu prélevés sur ton salaire (${Math.round(e.rate * 100)} %).` : '',
      e.property ? `Taxe foncière de ton logement : ${e.property} €.` : '',
    ].filter(Boolean).join(' '),
    choices: OK,
  }),
  vehicleBill: (a, w, e) => ({
    icon: '🧾', title: 'Assurance du véhicule', text: `${e.name} : ${e.amount} € d’assurance et d’entretien cette semaine.`, choices: OK,
  }),
  fired: (a, w, e) => ({
    icon: '📦', title: 'Tu es renvoyé·e',
    text: `${e.building.name} met fin à ton contrat (${e.reason}). Postule ailleurs, ou demande des tuyaux à tes connaissances.`,
    choices: OK,
  }),
  raise: (a, w, e) => ({
    icon: '📈', title: 'Augmentation !', text: `Du travail sérieux : ton salaire passe à ${e.wage} €/h.`, choices: OK,
  }),
  hired: (a, w, e) => ({
    icon: '🤝', title: 'Embauché·e !',
    text: `${e.building.name} t’engage à ${e.wage} €/h, ${fmtShift(a.job)} (${a.job.days.map(d => DAY_SHORT[d]).join(' ')}). Premier service ${nextShiftText(a, w)}.`,
    choices: OK,
  }),
  rentBill: (a, w, e) => ({
    icon: '🧾', title: 'Loyer de la semaine', text: `${landlordName(w)} attend ${e.amount} €.`,
    choices: [{ icon: '🧾', label: 'Payer maintenant', action: 'pay_rent' }, { icon: '⏳', label: 'Plus tard' }],
  }),
  rentReminder: (a, w) => ({
    icon: '✉️', title: `Relance de ${landlordName(w)}`,
    text: `Tu dois ${a.rentDue} €. Sans paiement sous 4 jours, c’est l’expulsion.`,
    choices: [{ icon: '🧾', label: 'Payer maintenant', action: 'pay_rent' }, { icon: '⏳', label: 'Plus tard' }],
  }),
  evicted: (a, w, e) => ({
    icon: '🚪', title: 'Expulsion',
    text: `Tu as perdu ton logement (${e.building.name}). Tu peux dormir au Métro Saint-Paul en attendant d’en louer un autre.`,
    choices: OK,
  }),
};

const GAP = 120; // minutes de jeu minimum entre deux événements non urgents

// Le « meneur de jeu » d'un joueur : décide quand proposer un événement.
export class EventDirector {
  constructor(world, actor) {
    this.world = world;
    this.actor = actor;
    this.active = null;
    this.queue = [];
    this.gap = 20;
    this.cool = {};
    this.lastDay = {};
    this.met = {};
    world.directors.push(this);
    for (const name of Object.keys(PUSHED)) {
      world.on(name, e => { if (e.actor === actor) this.push(PUSHED[name](actor, world, e)); });
    }
  }

  update(dt) {
    for (const k in this.cool) this.cool[k] -= dt;
    this.gap -= dt;
    if (this.active) {
      this.active.age += dt;
      if (this.active.age > this.active.ttl) this.close();
      return;
    }
    if (this.queue.length) return this.show(this.queue.shift());

    const a = this.actor, w = this.world;
    for (const ev of EVENTS) {
      if (!this.ready(ev) || (!ev.urgent && this.gap > 0)) continue;
      const ctx = ev.when(a, w, this);
      if (!ctx) continue;
      if (ev.chance != null) {
        // tirage unique : si raté, on n'y revient pas avant le délai
        this.cool[ev.id] = ev.cooldown || 240;
        this.lastDay[ev.id] = w.day;
        if (Math.random() > ev.chance) continue;
      }
      return this.fire(ev, ctx);
    }
  }

  ready(ev) {
    if ((this.cool[ev.id] || 0) > 0) return false;
    if (ev.once === 'day' && this.lastDay[ev.id] === this.world.day) return false;
    return true;
  }

  fire(ev, ctx) {
    const a = this.actor, w = this.world;
    const val = f => (typeof f === 'function' ? f(a, w, ctx, this) : f);
    this.cool[ev.id] = ev.cooldown || 240;
    this.lastDay[ev.id] = w.day;
    if (ev.onFire) ev.onFire(a, w, ctx, this);
    this.show({
      id: ev.id, urgent: !!ev.urgent, icon: ev.icon, title: val(ev.title), text: val(ev.text),
      choices: val(ev.choices), age: 0, ttl: ev.ttl || 180,
    });
  }

  // Événement imposé par le monde : il passe devant un événement ordinaire en cours.
  push(ev) {
    const inst = { ...ev, id: 'push', urgent: true, age: 0, ttl: 720 };
    if (this.active && !this.active.urgent) this.active = null;
    if (this.active) this.queue.push(inst);
    else this.show(inst);
  }

  show(inst) {
    this.active = inst;
    this.world.emit('event', inst);
  }

  check(choice) {
    if (!choice.action) return true;
    return this.world.check(this.actor, choice.action, choice.params);
  }

  choose(i) {
    const c = this.active && this.active.choices[i];
    if (!c) return { ok: false };
    if (c.action) {
      const r = this.world.perform(this.actor, c.action, c.params);
      if (!r.ok) return r;
    }
    this.close();
    return { ok: true };
  }

  close() {
    this.active = null;
    this.gap = GAP;
    this.world.emit('eventClosed');
  }
}
