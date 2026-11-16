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

export function ensureGoals(a, finished = false) {
  if (!a.goals) a.goals = { tut: finished ? TUTORIAL.length : 0, flags: {}, claimed: {} };
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
  world.on('done', e => { if (e.actor === actor) mark(e.id); });
}
