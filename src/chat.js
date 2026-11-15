import { canReach } from './sim/actions.js';
import { rel, addRel, level, near, canPause, reply as smallTalk, tip as jobTip, ROLE_TITLES } from './sim/social.js';
import { jobTitle, openings } from './sim/jobs.js';
import { itemById } from './sim/catalog.js';
import { state } from './state.js';

// Conversation libre avec un PNJ.
// Le PNJ répond grâce à Claude (via /api/chat sur le serveur local) ; sans clé API,
// des réponses intégrées prennent le relais. Dans les deux cas, ses actions passent
// par world.perform et les règles du jeu (règle d'or).

const PERSONALITY = {
  'Inès': 'chaleureuse, bavarde, passionnée de café, toujours partante pour déjeuner',
  'Karim': 'sérieux et organisé, responsable exigeant mais juste, aime le vélo',
  'Léa': 'matinale et douce, fière de son pain, un peu timide',
  'Hugo': 'créatif, sûr de lui, aime sa voiture et les beaux projets',
  'Awa': 'drôle et directe, connaît tout le monde dans le quartier',
  'Théo': 'jeune, détendu, fan de musique, vit au jour le jour',
  'Chloé': 'rêveuse, élégante, adore les fleurs',
  'Marcel': 'retraité bougon mais gentil au fond, souvent fauché, raconte le Marais d’autrefois',
  'Yanis': 'stylé, passionné de mode, conseille volontiers sur les tenues',
  'Jo': 'mécano bricoleur, parle vélos et moteurs avec enthousiasme',
  'Bernard': 'facteur jovial, sait qui habite où, adore les potins du quartier',
  'Nadia': 'agente de police calme et attentive, rappelle les règles avec gentillesse',
  'Mme Garnier': 'propriétaire du quartier, polie mais très attentive aux loyers payés à temps',
};

const PLACE_ACTIONS = { cafe: 'coffee', boulangerie: 'eat_bakery', superette: 'groceries', travail: 'work' };

let aiAvailable = null; // null = inconnu, false = pas de clé (réponses intégrées)

const band = (v, lo, hi, labels) => (v < lo ? labels[0] : v < hi ? labels[1] : labels[2]);

// Fiche envoyée au modèle : uniquement ce que le PNJ peut savoir
function card(npc) {
  const w = state.world, p = state.player;
  const r = rel(npc, p);
  const job = npc.job ? `${jobTitle(w, npc.job)}${npc.job.street ? '' : ` chez ${w.building(npc.job.building).name}`}` : 'sans emploi';
  const where = npc.inside != null ? w.building(npc.inside).name : 'dans la rue';
  const canLend = r >= 30 && npc.money > 60;
  const maxLend = Math.floor(Math.min(100, npc.money / 3));
  const lunch = (w.hour >= 11.5 && w.hour < 14) || (w.hour >= 19 && w.hour < 21.5);
  const open = w.map.buildings.filter(b => openings(w, b) > 0).map(b => `${b.name} (${b.jobs.wage} €/h)`);
  return {
    nom: npc.name,
    personnalite: PERSONALITY[npc.name] || 'habitant·e du quartier',
    metier: job,
    fonction: npc.role ? ROLE_TITLES[npc.role] : null,
    activite_actuelle: npc.doing || 'disponible',
    lieu: where,
    humeur: { faim: band(npc.hunger, 40, 70, ['rassasié·e', 'un peu faim', 'affamé·e']), energie: band(npc.energy, 25, 60, ['épuisé·e', 'fatigué·e', 'en forme']), argent: band(npc.money, 60, 400, ['fauché·e', 'correct', 'à l’aise']) },
    joueur: p.name,
    relation_avec_le_joueur: `${level(r)[1]} (${r}/100)`,
    situation_du_joueur: { metier: p.job ? jobTitle(w, p.job) : 'sans emploi', logement: p.home == null ? 'sans logement' : 'a un logement' },
    moment: `${w.dayShort} ${w.clock}, météo : ${w.weather === 'rain' ? 'pluie' : w.weather === 'cloud' ? 'nuageux' : 'beau temps'}`,
    postes_libres_connus: open,
    par_telephone: !(npc.inside === p.inside && (npc.inside != null || Math.hypot(npc.px - p.px, npc.py - p.py) <= 2.5)),
    actions_possibles: {
      relation_plus: true, relation_moins: true,
      donner_tuyau: open.length > 0,
      preter_argent: canLend ? `oui, maximum ${maxLend} €` : 'non',
      recommander: npc.job && !npc.job.street && r >= 20 ? `oui, chez ${w.building(npc.job.building).name}` : 'non',
      inviter_dejeuner: lunch && !npc.doing ? 'oui' : 'non (pas l’heure ou occupé·e)',
      aller_quelque_part: npc.doing === 'work' ? 'non, en plein travail' : 'oui : cafe, boulangerie, superette, maison, travail, parc',
    },
  };
}

// ---------- Réponses intégrées (sans clé API) ----------
function localReply(npc, text) {
  const t = text.toLowerCase();
  const w = state.world, p = state.player;
  const r = rel(npc, p);
  const has = re => re.test(t);
  if (has(/\b(idiot|con|nul|dégage|degage|ta gueule|imbécile|imbecile|crétin|cretin)\b/)) {
    return { reply: 'Pas la peine d’être désagréable, hein.', actions: [{ type: 'relation_moins', amount: 0, place: 'aucun' }] };
  }
  if (has(/(argent|prêt|prete|prêter|preter|thune|sous|dépanner|depanner)/)) {
    if (r >= 30 && npc.money > 100) return { reply: 'Bon… je peux te dépanner un peu, mais tu me les rends, hein !', actions: [{ type: 'preter_argent', amount: 30, place: 'aucun' }] };
    return { reply: r < 30 ? 'On ne se connaît pas assez pour ça, désolé·e.' : 'Je suis un peu juste en ce moment, désolé·e.', actions: [] };
  }
  if (has(/(recommand|piston|parler de moi)/)) {
    if (npc.job && !npc.job.street && r >= 20) return { reply: 'Avec plaisir, je dirai du bien de toi !', actions: [{ type: 'recommander', amount: 0, place: 'aucun' }] };
    return { reply: 'Je ne peux pas vraiment t’aider pour ça.', actions: [] };
  }
  if (has(/(travail|boulot|job|emploi|recrut|poste)/)) {
    return { reply: 'Laisse-moi réfléchir…', actions: [{ type: 'donner_tuyau', amount: 0, place: 'aucun' }] };
  }
  if (has(/(faim|manger|déjeuner|dejeuner|dîner|diner|resto|on mange)/)) {
    const lunch = (w.hour >= 11.5 && w.hour < 14) || (w.hour >= 19 && w.hour < 21.5);
    if (lunch && r >= 10 && !npc.doing) return { reply: 'Bonne idée, allons au café !', actions: [{ type: 'inviter_dejeuner', amount: 0, place: 'aucun' }] };
    return { reply: npc.doing === 'work' ? 'Là je bosse, une autre fois !' : 'Pas maintenant, mais une autre fois avec plaisir.', actions: [] };
  }
  if (has(/(café|cafe)/) && npc.doing !== 'work') {
    return { reply: 'Tiens, ça me donne envie d’un café. J’y vais !', actions: [{ type: 'aller_quelque_part', amount: 0, place: 'cafe' }] };
  }
  if (has(/(merci|sympa|cool|génial|genial|super|top)/)) {
    return { reply: 'Avec plaisir !', actions: [{ type: 'relation_plus', amount: 0, place: 'aucun' }] };
  }
  if (has(/^(salut|bonjour|coucou|hello|bonsoir|yo)/)) {
    return { reply: r >= 30 ? `Hey ${p.name} ! Ça me fait plaisir de te voir.` : r >= 10 ? `Salut ${p.name} !` : 'Bonjour ! On se connaît ?', actions: [{ type: 'relation_plus', amount: 0, place: 'aucun' }] };
  }
  // Petite discussion selon sa situation
  return { reply: smallTalk(w, npc, p).replace(/^[^:]+ : « (.*) »$/, '$1'), actions: [{ type: 'relation_plus', amount: 0, place: 'aucun' }] };
}

// ---------- Appliquer ce que le PNJ décide (toujours via les règles du jeu) ----------
function applyActions(npc, actions) {
  const w = state.world, p = state.player;
  const notes = [], offers = [];
  for (const act of (actions || []).slice(0, 3)) {
    switch (act.type) {
      case 'relation_plus': addRel(p, npc, 3); break;
      case 'relation_moins': addRel(p, npc, -8); notes.push(`💔 ${npc.name} est vexé·e`); break;
      case 'donner_tuyau': notes.push(jobTip(w, p, npc)); break;
      case 'preter_argent': {
        const amount = Math.max(1, Math.min(100, Math.round(act.amount) || 20));
        const r = w.perform(npc, 'lend', { who: p.id, amount });
        if (r.ok) notes.push(`💶 ${npc.name} te prête ${amount} €`);
        break;
      }
      case 'recommander': {
        const r = w.perform(npc, 'recommend', { who: p.id });
        if (r.ok) notes.push(`🤝 ${npc.name} te recommande chez ${w.building(npc.job.building).name}`);
        break;
      }
      case 'inviter_dejeuner':
        offers.push({ icon: '🍽️', label: `Déjeuner avec ${npc.name}`, action: 'eat_cafe', params: { with: npc.id } });
        break;
      case 'aller_quelque_part': {
        let id = PLACE_ACTIONS[act.place], params = {};
        if (act.place === 'maison') { id = 'enter'; params = { building: npc.home }; }
        if (act.place === 'parc') { id = 'goto'; params = parkTile(w); }
        if (id && w.check(npc, id, params) === true) {
          w.perform(npc, id, params);
          npc.thinkIn = 30; // il ne change pas d'avis aussitôt
          notes.push(`🚶 ${npc.name} s’en va`);
        }
        break;
      }
      default: break;
    }
  }
  return { notes, offers };
}

function parkTile(w) {
  const grass = [];
  for (let y = 0; y < w.map.h; y++) for (let x = 0; x < w.map.w; x++) {
    const t = w.map.tiles[y][x];
    if (t.walk && t.ground === 'grass') grass.push({ x, y });
  }
  return grass[Math.floor(Math.random() * grass.length)];
}

export const chatLog = npc => (state.chats ||= {})[npc.id] ||= [];

// ---------- Thèmes de conversation ----------
const lunchTime = w => (w.hour >= 11.5 && w.hour < 14) || (w.hour >= 19 && w.hour < 21.5);
export const TOPICS = [
  { id: 'ca_va', icon: '👋', label: 'Comment ça va ?', line: 'Salut ! Comment ça va ?' },
  { id: 'travail', icon: '💼', label: 'Son travail', line: 'Et le travail, ça se passe comment ?' },
  { id: 'quartier', icon: '🗞️', label: 'Nouvelles du quartier', line: 'Quoi de neuf dans le quartier ?' },
  { id: 'conseil', icon: '💡', label: 'Un conseil', line: 'Tu aurais un conseil pour bien vivre ici ?' },
  { id: 'emploi', icon: '🔎', label: 'Chercher un emploi', line: 'Tu connais un endroit qui recrute ?' },
  { id: 'manger', icon: '🍽️', label: 'Manger ensemble', line: 'Ça te dit qu’on mange ensemble ?', when: w => lunchTime(w) },
  { id: 'compliment', icon: '😊', label: 'Un compliment', line: 'Tu as l’air en forme aujourd’hui !' },
  { id: 'argent', icon: '💶', label: 'Demander un prêt', line: 'Dis… tu pourrais me dépanner un peu d’argent ?', when: (w, p, n) => rel(p, n) >= 10 },
  { id: 'recommander', icon: '🤝', label: 'Me recommander', line: 'Tu pourrais parler de moi à ton responsable ?', when: (w, p, n) => n.job && !n.job.street },
  { id: 'au_revoir', icon: '🚶', label: 'Au revoir', line: 'Bon, je te laisse. À plus !' },
];
export const topicsFor = npc => TOPICS.filter(t => !t.when || t.when(state.world, state.player, npc));

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const END = [];

// Réponse d'un PNJ à un thème (mode intégré) : texte, actions, et réponses possibles pour le joueur
function topicReply(npc, id) {
  const w = state.world, p = state.player;
  const r = rel(npc, p);
  const friend = r >= 30;
  const act = (type, extra = {}) => ({ type, amount: 0, place: 'aucun', ...extra });
  switch (id) {
    case 'ca_va': {
      const mood = npc.hunger > 65 ? 'Ça va… mais j’ai une de ces faims !'
        : npc.energy < 30 ? 'Crevé·e, mais ça va. Vivement ce soir.'
        : npc.money < 60 ? 'Bof, fin de mois difficile, tu vois…'
        : pick(['Très bien, merci ! Et toi ?', 'Ça roule ! Et toi, quoi de beau ?', 'Tranquille, belle journée dans le Marais.']);
      return { reply: friend ? `${p.name} ! ${mood}` : mood, actions: [act('relation_plus')], choices: [
        { icon: '😊', label: 'Ça va bien !', line: 'Moi aussi, ça va bien !', react: 'Tant mieux, ça fait plaisir !', rel: 2 },
        { icon: '😔', label: 'Pas trop…', line: 'Pas trop, à vrai dire…', react: friend ? 'Oh… Si tu as besoin, je suis là, hein.' : 'Courage, ça va s’arranger.', rel: 3 },
        { icon: '🗞️', label: 'Quoi de neuf ?', topic: 'quartier' },
      ] };
    }
    case 'travail': {
      if (!npc.job) return { reply: npc.role === 'landlord' ? 'Moi ? Je m’occupe de mes immeubles. Et des loyers, surtout !' : 'Je cherche du travail en ce moment… pas facile.', actions: [], choices: [
        { icon: '🔎', label: 'Je peux t’aider ?', line: 'Je peux t’aider à chercher ?', react: 'C’est gentil ! Si tu entends parler de quelque chose…', rel: 4 },
        { icon: '💪', label: 'Courage !', line: 'Courage, tu vas trouver !', react: 'Merci, ça me touche.', rel: 2 },
      ] };
      const type = npc.job.street ? (npc.role === 'police' ? 'police' : 'postman') : w.building(npc.job.building).type;
      const lines = {
        cafe: 'Les clients du matin sont pressés, mais j’adore l’ambiance du café.',
        bakery: 'Debout à l’aube tous les jours… mais l’odeur du pain chaud, ça n’a pas de prix.',
        office: 'Beaucoup de réunions, mais l’équipe est sympa.',
        shop: 'Les rayons ne se remplissent pas tout seuls, crois-moi !',
        fashion: 'La nouvelle collection est arrivée, passe voir !',
        garage: 'Encore trois vélos à réparer aujourd’hui. J’adore ça.',
        police: 'Le Marais est plutôt calme. Tant mieux !',
        postman: 'Ma tournée est longue, mais je connais tout le monde.',
      };
      const boss = npc.role === 'manager' ? ' Et en tant que responsable, je dois tout surveiller !' : '';
      return { reply: (lines[type] || 'Ça va, on ne se plaint pas.') + boss, actions: [act('relation_plus')], choices: [
        { icon: '👍', label: 'Ça a l’air bien !', line: 'Ça a l’air bien !', react: 'Ça l’est, la plupart du temps !', rel: 2 },
        { icon: '🔎', label: 'Vous recrutez ?', topic: 'emploi' },
        { icon: '💪', label: 'Bon courage !', line: 'Bon courage alors !', react: 'Merci !', rel: 1 },
      ] };
    }
    case 'quartier': {
      const others = w.actors.filter(o => o !== npc && o !== p);
      const o = pick(others);
      const facts = [];
      if (o.role === 'landlord') facts.push(`${o.name} passe ses journées à vérifier les loyers. Ne sois pas en retard !`);
      if (o.role === 'police') facts.push(`${o.name} patrouille souvent par ici. Mieux vaut rester dans les clous.`);
      if (o.job && !o.job.street) facts.push(`${o.name} travaille chez ${w.building(o.job.building).name}${o.role === 'manager' ? ', c’est même la personne responsable' : ''}.`);
      if (o.vehicle) facts.push(`${o.name} se déplace en ${itemById(o.vehicle).name.toLowerCase()} maintenant !`);
      if (o.money < 60) facts.push(`${o.name} a du mal à boucler ses fins de mois en ce moment.`);
      if (!o.job && !o.role) facts.push(`${o.name} cherche du travail.`);
      if (w.weather === 'rain') facts.push('Avec cette pluie, les cafés sont pleins !');
      const open = w.map.buildings.filter(b => openings(w, b) > 0);
      if (open.length) facts.push(`On dit que ${pick(open).name} cherche du monde.`);
      return { reply: pick(facts.length ? facts : ['Rien de spécial, la vie suit son cours.']), actions: [act('relation_plus')], choices: [
        { icon: '😮', label: 'Ah bon ?', line: 'Ah bon ? Raconte !', react: 'Je t’en ai déjà trop dit, haha !', rel: 2 },
        { icon: '🗞️', label: 'Autre chose ?', topic: 'quartier' },
        { icon: '🙂', label: 'Merci pour l’info', line: 'Merci pour l’info !', react: 'De rien !', rel: 1 },
      ] };
    }
    case 'conseil': {
      const tips = [
        'Paie ton loyer avant la relance : Mme Garnier ne rigole pas avec ça.',
        'Les commerces ferment vers 22h. Fais tes courses avant !',
        'Un vélo, ça change la vie dans le quartier.',
        'Sois à l’heure au travail : au troisième avertissement, c’est la porte.',
        'Cuisiner chez toi coûte bien moins cher que manger dehors.',
        'Économise un peu chaque semaine : acheter son logement, ça libère du loyer.',
        'Fais-toi des amis : ils te donnent des tuyaux et peuvent te recommander.',
      ];
      return { reply: pick(tips), actions: [act('relation_plus')], choices: [
        { icon: '🙏', label: 'Merci, je retiens', line: 'Merci, je retiens !', react: 'Avec plaisir !', rel: 2 },
        { icon: '💡', label: 'Un autre ?', topic: 'conseil' },
      ] };
    }
    case 'emploi':
      return { reply: 'Laisse-moi réfléchir…', actions: [act('donner_tuyau')], choices: [
        { icon: '🙏', label: 'Merci du tuyau !', line: 'Merci du tuyau !', react: 'Bonne chance !', rel: 2 },
        ...(npc.job && !npc.job.street ? [{ icon: '🤝', label: 'Tu me recommandes ?', topic: 'recommander' }] : []),
      ] };
    case 'manger':
      if (r >= 10 && !npc.doing) return { reply: 'Avec plaisir ! Allons au café.', actions: [act('inviter_dejeuner')], choices: END };
      return { reply: npc.doing === 'work' ? 'Là je travaille, une autre fois !' : r < 10 ? 'On se connaît à peine… une autre fois peut-être.' : 'Pas maintenant, désolé·e.', actions: [], choices: END };
    case 'compliment':
      if (r < 10) return { reply: 'Euh… merci ? C’est gentil.', actions: [act('relation_plus')], choices: END };
      return { reply: pick(['Oh, merci ! Ça fait plaisir !', 'Toi aussi, tu sais !', 'Haha, arrête, je vais rougir !']), actions: [act('relation_plus'), act('relation_plus')], choices: [
        { icon: '😄', label: 'C’est sincère !', line: 'C’est sincère !', react: 'Merci, vraiment.', rel: 2 },
      ] };
    case 'argent':
      if (r >= 30 && npc.money > 100) return { reply: 'Bon… je peux te dépanner un peu. Mais tu me les rends, hein !', actions: [act('preter_argent', { amount: 30 })], choices: [
        { icon: '🙏', label: 'Promis, merci !', line: 'Promis, je te rembourse vite. Merci !', react: 'J’ai confiance.', rel: 1 },
      ] };
      return { reply: r < 30 ? 'On ne se connaît pas assez pour ça, désolé·e.' : 'Je suis un peu juste en ce moment…', actions: [], choices: [
        { icon: '🙂', label: 'Pas de souci', line: 'Pas de souci, je comprends.', react: 'Merci de comprendre.', rel: 1 },
      ] };
    case 'recommander':
      if (npc.job && !npc.job.street && r >= 20) return { reply: 'Avec plaisir, je dirai du bien de toi !', actions: [act('recommander')], choices: END };
      return { reply: r < 20 ? 'Je te connais encore trop peu pour ça.' : 'Je ne peux pas vraiment t’aider pour ça.', actions: [], choices: END };
    case 'au_revoir':
      return { reply: pick(['À plus !', 'Bonne journée !', 'À bientôt !']), actions: [], choices: END };
    default:
      return { reply: '…', actions: [], choices: END };
  }
}

// Le PNJ s'arrête pour te parler (au lieu de partir d'un coup)
export function engage(npc, minutes = 20) {
  const w = state.world, p = state.player;
  if (!near(p, npc) || !canPause(npc, w) || npc.doing === 'listen') return;
  w.perform(npc, 'listen', { who: p.id, minutes });
}

const short = s => (s.length > 60 ? s.slice(0, 57) + '…' : s);
export const chatMode = () => (aiAvailable === false ? 'local' : 'ai');

// Envoie une phrase au PNJ. topic = id d'un thème (réponses intégrées dédiées, et indice pour l'IA).
export async function sendChat(npc, text, topic = null) {
  const p = state.player;
  if (!canReach(p, npc)) return { error: 'Trop loin pour parler (rapproche-toi, ou achète un smartphone pour appeler tes amis).' };
  const log = chatLog(npc);
  log.push({ from: 'player', text });
  engage(npc, 25);
  p.bubble = short(text); p.bubbleHold = 4;
  let res = null;
  if (aiAvailable !== false) {
    try {
      const c = card(npc);
      if (topic) c.sujet_choisi_par_le_joueur = TOPICS.find(t => t.id === topic).label;
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: c, history: log.slice(0, -1), message: text }),
      });
      if (r.ok) { res = await r.json(); aiAvailable = true; } else if (r.status === 503) aiAvailable = false;
    } catch { aiAvailable = false; }
  }
  let choices = [];
  if (res) {
    // L'IA propose des réponses que le joueur peut choisir
    choices = (res.suggestions || []).slice(0, 3).map(s => ({ icon: '💬', label: s, line: s, free: true }));
  } else {
    res = topic ? topicReply(npc, topic) : localReply(npc, text);
    choices = res.choices || [];
  }
  log.push({ from: 'npc', text: res.reply });
  npc.bubble = short(res.reply); npc.bubbleHold = 6; npc.bubbleIn = 6;
  const { notes, offers } = applyActions(npc, res.actions);
  for (const n of notes) log.push({ from: 'note', text: n });
  if (log.length > 30) log.splice(0, log.length - 30);
  return { reply: res.reply, notes, offers, choices };
}

// Le joueur choisit un thème
export function sendTopic(npc, topicId) {
  const t = TOPICS.find(x => x.id === topicId);
  return sendChat(npc, t.line, t.id);
}

// Le joueur choisit une réponse proposée
export async function sendChoice(npc, choice) {
  if (choice.topic) return sendTopic(npc, choice.topic);
  if (choice.free || aiAvailable === true) return sendChat(npc, choice.line);
  // Réaction intégrée courte
  const p = state.player;
  if (!canReach(p, npc)) return { error: 'Trop loin pour parler.' };
  const log = chatLog(npc);
  log.push({ from: 'player', text: choice.line });
  log.push({ from: 'npc', text: choice.react });
  if (choice.rel) addRel(p, npc, choice.rel);
  engage(npc, 20);
  p.bubble = short(choice.line); p.bubbleHold = 4;
  npc.bubble = short(choice.react); npc.bubbleHold = 6; npc.bubbleIn = 6;
  return { reply: choice.react, notes: [], offers: [], choices: [] };
}
