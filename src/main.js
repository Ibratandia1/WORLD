import { QUARTIER } from './map/quartier.js';
import { parseMap } from './map/parse.js';
import { World } from './sim/world.js';
import { spawnPeople } from './sim/people.js';
import { EventDirector } from './sim/events.js';
import { CityLife } from './sim/city.js';
import { Government } from './sim/gov.js';
import { ensureGoals, trackGoals } from './sim/goals.js';
import { Festivals } from './sim/festivals.js';
import { Safety } from './sim/safety.js';
import { Justice } from './sim/justice.js';
import { Bank } from './sim/bank.js';
import { Economy } from './sim/economy.js';
import { Calendar } from './sim/calendar.js';
import { settings, onSettings } from './settings.js';
import { t } from './i18n.js';
import { UI } from './ui.js';
import { GameController } from './game/game.js';
import { loadProfile, saveProfile } from './look.js';
import { openCustomizer } from './customize.js';
import { loadGame, startAutosave } from './save.js';
import { showStart, chooseLanguage } from './start.js';
import { state } from './state.js';

// 1. La simulation (indépendante de l'affichage)
const profile = loadProfile();
const world = new World(parseMap(QUARTIER));
const player = spawnPeople(world, profile);
const director = new EventDirector(world, player);
new CityLife(world); // la ville vivante : commerces, arrivées, départs (world.city)
new Government(world); // la mairie : maire, impôts, aides, élections (world.gov)
new Safety(world); // délits, police, prison, incendies (world.safety)
new Justice(world); // garde à vue, procès, jury, avocats (world.justice)
new Bank(world); // épargne, intérêts, prêts (world.bank)
new Economy(world); // trésorerie des commerces, marché du travail et du logement (world.economy)
new Calendar(world); // années, âges, anniversaires, retraite, Nouvel An (world.calendar)
// Mode test (?test dans l'adresse) : partie neuve, jamais sauvegardée — la vraie partie n'est pas touchée
const TEST = new URLSearchParams(location.search).has('test');
const resumed = TEST ? false : loadGame(world, [director]); // reprend la dernière partie s'il y en a une
if (!TEST) {
  startAutosave(world, [director], () => {
    const el = document.getElementById('saved');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
}

// Nouvelle partie : le quartier s'éveille un peu avant que tu prennes la main (les commerçants ont ouvert)
if (!resumed) for (let i = 0; i < 25; i++) world.step(1);

new Festivals(world); // marché, brocante, concerts… (world.festivals), après le chargement pour partir du bon jour

// Objectifs : une partie reprise après le 3e jour n'a pas besoin du tutoriel
ensureGoals(player, resumed && world.day > 3);
trackGoals(world, player);

Object.assign(state, { world, player, director });
// Une tenue achetée change l'apparence : on la garde dans le profil
world.on('lookChanged', e => { if (e.actor === player && !new URLSearchParams(location.search).has('test')) saveProfile({ name: player.name, look: player.look }); });
state.ui = new UI(world, player, director);

// 2. Le jeu (logique : boucle, intérieurs, objets de rue) puis l'affichage en 3D (Three.js)
const DPR = settings().saver ? 1 : Math.min(window.devicePixelRatio || 1, 2); // économie de batterie : résolution simple
state.dpr = DPR;
const game = new GameController(world);
// Ouvert téléphone à la verticale (écran « Tourne ton téléphone ») : quand on le tourne, on redémarre
// proprement en paysage (sinon la vue et les fenêtres gardent les dimensions de l'écran vertical)
const bootPortrait = window.innerHeight > window.innerWidth && matchMedia('(pointer: coarse)').matches;
if (bootPortrait) {
  const check = () => { if (window.innerWidth > window.innerHeight) location.reload(); };
  window.addEventListener('resize', () => setTimeout(check, 300));
  window.addEventListener('orientationchange', () => setTimeout(check, 500));
}

import('./city3d.js').then(({ startCity3D }) => {
  state.city3d = startCity3D(world, {
    player, saver: settings().saver,
    onFrame: ms => game.update(ms), // le monde avance à chaque image
    // Toucher un lieu : on y va et on entre directement ; un logement qui n'est pas le tien ouvre sa petite fiche (louer)
    // (toucher un lieu = y aller : si on ne peut pas entrer, on marche jusqu'à la porte et la fiche s'ouvre)
    onPlace: b => {
      if (player.inside === b.id) return;
      state.city3d.setFollow(true);
      const walkToDoor = () => {
        const e = [...b.entrances].sort((u, v) => Math.hypot(u.x - player.px, u.y - player.py) - Math.hypot(v.x - player.px, v.y - player.py))[0];
        if (e && Math.hypot(e.x - player.px, e.y - player.py) > 0.6) world.perform(player, 'goto', { x: e.x, y: e.y });
      };
      if (b.type === 'home' && b.id !== player.home) { walkToDoor(); return state.ui.showPlace(b); }
      const ok = world.check(player, 'enter', { building: b.id });
      if (ok === true) { state.ui.closePanels && state.ui.closePanels(); world.perform(player, 'enter', { building: b.id }); return state.ui.render(); }
      state.city3d.floatText(t(typeof ok === 'string' ? ok : 'Pas possible'), '#e2475b');
      walkToDoor();
      state.ui.showPlace(b); // fermé, en feu… : la fiche dit quand ça ouvre
    },
    onPerson: a => state.ui.showPerson(a),
    onTile: (x, y, tile) => game.tapTile(x, y, tile), // sol, objets de la rue, stands des fêtes
    festSpots: () => game.fest.spots,
    // Intérieurs : la logique fournit la pièce, les postes et la réponse aux touchers
    interiorCtx: () => game.interior.ctx3d(),
    onInteriorTap: (x, y, id) => game.interior.tapTile3d(x, y, id),
    onLeave: () => { world.perform(player, 'leave'); state.ui.render(); },
    onBoom: () => { if (player.outdoors && state.ui.sound && state.ui.sound.boom) state.ui.sound.boom(); }, // feu d'artifice
  });
  document.body.classList.add('v3d');
  for (const id of Object.keys(world.safety ? world.safety.fires : {})) state.city3d.showFire(world.building(+id));
  world.on('fire', e => state.city3d.showFire(e.building));
  world.on('fireOut', e => state.city3d.hideFire(e.building));
  game.shownInterior = undefined; // (réaffiche l'intérieur si la partie reprend dans un lieu)
  state.city3d.centerOnPlayer();
}).catch(err => { // Three.js n'a pas pu se charger (pas de réseau ?) : on le dit simplement
  console.error('3D indisponible', err);
  const el = document.createElement('div');
  el.id = 'nogl';
  el.innerHTML = `<div><b>🌐 ${t('Impossible de charger la ville')}</b><p>${t('Vérifie ta connexion internet, puis réessaie.')}</p><button>${t('Réessayer')}</button></div>`;
  el.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(el);
});

// 3. Accueil : nouvelle partie → création du personnage ; sinon écran « Continuer »
if (TEST) { document.title = 'World (test)'; state.ui.showWelcome(); }
else if (resumed) showStart();
else chooseLanguage(() => openCustomizer({ first: true })); // nouvelle partie : langue → personnage → introduction

window.world = world; // pratique pour déboguer dans la console
window.state = state;
