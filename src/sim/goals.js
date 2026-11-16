import { rel } from './social.js';
import { CATALOG } from './catalog.js';

// Objectifs du joueur : « Premiers pas » (tutoriel) puis « Rêves » (objectifs à long terme).
// Les récompenses passent par l'action `claim_goal` (règle d'or : rien ne contourne ACTIONS).
// État gardé sur l'acteur : a.goals = { tut: étape suivante, flags: {…}, claimed: {…} }

// Premiers pas : `done` regarde les actions déjà faites (flags), `target` sert au bouton « Montrer »
export const TUTORIAL = [
  { id: 'tut_eat', icon: '🥐', text: 'Prends un petit-déjeuner', hint: 'Dans un café ☕ ou une boulangerie 🥐 ouverts (les boulangeries ferment le lundi), ou cuisine chez toi.', done: f => f.eat_bakery || f.eat_cafe || f.eat_home || f.coffee, target: 'breakfast' },
  { id: 'tut_work', icon: '💼', text: 'Va travailler', hint: 'Ton service commence à l’heure indiquée sur 💼 en bas à gauche. Touche ton lieu de travail, puis « Travailler ».', done: f => f.work, target: 'job' },
  { id: 'tut_shop', icon: '🛒', text: 'Fais des courses', hint: 'À la supérette 🛒 : 4 repas pour ton frigo (🥫 en bas à gauche).', done: f => f.groceries, target: 'shop' },
  { id: 'tut_cook', icon: '🍝', text: 'Cuisine chez toi', hint: 'Rentre chez toi 🏠 et touche la cuisinière, ou « Cuisiner » dans la fiche.', done: f => f.eat_home, target: 'home' },
  { id: 'tut_talk', icon: '💬', text: 'Discute avec un voisin', hint: 'Touche un habitant dans la rue, puis un sujet de conversation.', done: f => f.talk || f.joke || f.wave, target: 'people' },
  { id: 'tut_sleep', icon: '😴', text: 'Dors chez toi', hint: 'Le soir, rentre chez toi et touche le lit (ou « Dormir »).', done: f => f.sleep, target: 'home' },
];
export const TUT_REWARD = { money: 15, mood: 3 };
export const TUT_FINAL = { money: 100, mood: 10 }; // en plus, pour la dernière étape

// Rêves : progress(a, w) → [actuel, but]
const outfits = a => a.owned.filter(id => { const it = CATALOG.find(i => i.id === id); return it && it.look; }).length;
export const DREAMS = [
  { id: 'dream_friends', icon: '🤝', label: 'Avoir 5 ami·e·s', progress: (a, w) => [w.actors.filter(o => o !== a && rel(a, o) >= 30).length, 5], reward: { money: 150, mood: 15 } },
  { id: 'dream_career', icon: '📈', label: 'Obtenir 2 augmentations', progress: a => [a.job ? Math.max(0, a.job.wage - (a.job.baseWage || a.job.wage)) : 0, 2], reward: { money: 200, mood: 10 } },
  { id: 'dream_style', icon: '👗', label: 'Avoir 3 tenues ou accessoires', progress: a => [outfits(a), 3], reward: { money: 100, mood: 12 } },
  { id: 'dream_owner', icon: '🏡', label: 'Devenir propriétaire', progress: a => [a.housing === 'own' ? 1 : 0, 1], reward: { money: 300, mood: 20 } },
  { id: 'dream_rich', icon: '💰', label: 'Avoir 10 000 € de côté', progress: a => [Math.max(0, Math.floor(a.money)), 10000], reward: { money: 0, mood: 20 } },
  { id: 'dream_car', icon: '🚗', label: 'Rouler en voiture', progress: a => [a.owned.includes('voiture') ? 1 : 0, 1], reward: { money: 150, mood: 12 } },
  { id: 'dream_mayor', icon: '🏛️', label: 'Être élu·e maire', progress: (a, w) => [w.gov && w.gov.mayor === a.id ? 1 : 0, 1], reward: { money: 500, mood: 25 } },
];

// ---------- Objectifs du jour : 3 petites missions qui changent chaque jour ----------
// count(e) = combien l'action terminée e fait avancer la mission ; ok(a, w) = la mission a du sens aujourd'hui
const LEISURE = ['watch_tv', 'read_book', 'sit_bench', 'stroll', 'nap', 'admire_statue', 'wish_fountain'];
const LOCAL = ['coffee', 'eat_cafe', 'eat_bakery', 'groceries', 'shopping', 'market_buy', 'crepe'];
export const DAILY = [
  { id: 'd_work', icon: '💼', label: 'Termine ton service', need: 1, count: e => (e.id === 'work' ? 1 : 0), ok: (a, w) => !!(a.job && !a.job.street && a.job.days.includes((w.day - 1) % 7)) },
  { id: 'd_cook', icon: '🍝', label: 'Cuisine un repas chez toi', need: 1, count: e => (e.id === 'eat_home' ? 1 : 0), ok: a => a.home != null },
  { id: 'd_talk', icon: '💬', label: 'Discute avec 2 personnes', need: 2, count: e => (e.id === 'talk' || e.id === 'joke' ? 1 : 0), ok: () => true },
  { id: 'd_rest', icon: '📺', label: 'Prends du temps pour toi', need: 1, count: e => (LEISURE.includes(e.id) ? 1 : 0), ok: () => true },
  { id: 'd_local', icon: '🥐', label: 'Achète chez 2 commerçants', need: 2, count: e => (LOCAL.includes(e.id) ? 1 : 0), ok: () => true },
  { id: 'd_kind', icon: '🎁', label: 'Fais plaisir à quelqu’un', need: 1, count: e => (e.id === 'gift' || e.id === 'treat' || e.id === 'stroll' ? 1 : 0), ok: () => true },
  { id: 'd_birds', icon: '🐦', label: 'Nourris les pigeons', need: 1, count: e => (e.id === 'feed_pigeons' ? 1 : 0), ok: () => true },
  { id: 'd_study', icon: '🎓', label: 'Suis un cours à l’école', need: 1, count: e => (e.id === 'study' ? 1 : 0), ok: a => (a.education ?? 1) < 3 && a.money > 40 },
  { id: 'd_fest', icon: '🎪', label: 'Profite de la fête du quartier', need: 1, count: e => (['market_buy', 'crepe', 'dance', 'brocante_hunt'].includes(e.id) ? 1 : 0), ok: (a, w) => w.weekday === 6 || w.weekday === 5 || w.weekday === 4 },
  { id: 'd_sleep', icon: '😴', label: 'Dors une vraie nuit chez toi', need: 1, count: e => (e.id === 'sleep' ? 1 : 0), ok: a => a.home != null },
];
export const DAILY_REWARD = { money: 20, xp: 20 };
export const DAILY_BONUS = { money: 50, xp: 40 }; // les 3 du jour réussies

// Les missions du jour (tirées au réveil de façon déterministe, parmi celles qui ont du sens)
export function dailyFor(a, w) {
  const g = ensureGoals(a);
  if (!g.daily || g.daily.day !== w.day) {
    const pool = DAILY.filter(d => d.ok(a, w));
    let seed = (w.day * 9301 + 49297) % 233280;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const picks = [];
    if (pool.find(d => d.id === 'd_work')) picks.push('d_work'); // le travail d'abord, s'il y en a aujourd'hui
    while (picks.length < 3 && picks.length < pool.length) {
      const d = pool[Math.floor(rnd() * pool.length)];
      if (!picks.includes(d.id)) picks.push(d.id);
    }
    g.daily = { day: w.day, picks, progress: {}, claimed: {}, bonus: false };
  }
  return g.daily;
}
export const dailyDone = (a, id) => { const d = a.goals && a.goals.daily; const def = DAILY.find(x => x.id === id); return !!(d && def && (d.progress[id] || 0) >= def.need); };

// ---------- Niveau de vie (XP) ----------
export const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500];
export const LEVEL_TITLES = ['Nouveau venu', 'Habitant·e', 'Voisin·e apprécié·e', 'Figure du quartier', 'Pilier du Marais', 'Célébrité locale', 'Légende du Marais', 'Mémoire du Marais', 'Âme du Marais'];
export const levelOf = xp => { let l = 0; while (l + 1 < LEVELS.length && xp >= LEVELS[l + 1]) l++; return l; };
export const XP = { tut: 15, dream: 60 };

export function ensureGoals(a, finished = false) {
  if (!a.goals) a.goals = { tut: finished ? TUTORIAL.length : 0, flags: {}, claimed: {} };
  if (a.goals.xp == null) a.goals.xp = 0;
  return a.goals;
}

// Étape de tutoriel en cours (null quand tout est fait)
export const tutStep = a => (a.goals && a.goals.tut < TUTORIAL.length ? TUTORIAL[a.goals.tut] : null);
export const tutReady = a => { const s = tutStep(a); return !!(s && s.done(a.goals.flags)); };

// Rêve atteint mais récompense pas encore récupérée
export const dreamDone = (a, w, d) => { const [c, m] = d.progress(a, w); return c >= m; };
export const dreamClaimable = (a, w, d) => !!(a.goals && !a.goals.claimed[d.id] && dreamDone(a, w, d));

// Le rêve le plus proche d'être atteint (pour la carte d'objectif)
export function nextDream(a, w) {
  const open = DREAMS.filter(d => !(a.goals && a.goals.claimed[d.id]));
  open.sort((x, y) => { const [cx, mx] = x.progress(a, w), [cy, my] = y.progress(a, w); return cy / my - cx / mx; });
  return open[0] || null;
}

// Retient ce que le joueur a déjà fait (pour le tutoriel)
export function trackGoals(world, actor) {
  ensureGoals(actor);
  const mark = id => { actor.goals.flags[id] = true; };
  world.on('start', e => { if (e.actor === actor) mark(e.id); });
  world.on('done', e => {
    if (e.actor !== actor) return;
    mark(e.id);
    // missions du jour
    const d = dailyFor(actor, world);
    for (const id of d.picks) {
      const def = DAILY.find(x => x.id === id);
      const n = def ? def.count(e) : 0;
      if (n) d.progress[id] = Math.min(def.need, (d.progress[id] || 0) + n);
    }
  });
}
