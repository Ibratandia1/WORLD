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
import { settings } from './settings.js';
import { UI } from './ui.js';
import { GameScene } from './scenes/GameScene.js';
import { InteriorScene } from './scenes/InteriorScene.js';
import { FxScene } from './scenes/FxScene.js';
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

// 2. L'affichage Phaser (carte, intérieurs, effets)
// Rendu à la résolution réelle de l'écran (sinon l'image est étirée et floue sur téléphone / écran haute définition)
// (plafonné à 2 : au-delà, un téléphone dessine 2,25× plus de pixels pour une différence à peine visible)
const DPR = settings().saver ? 1 : Math.min(window.devicePixelRatio || 1, 2); // économie de batterie : résolution simple
state.dpr = DPR;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  transparent: true,
  scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
  render: { antialias: true, antialiasGL: true },
  input: { activePointers: 3 },
  scene: [GameScene, InteriorScene, FxScene],
});
window.addEventListener('resize', () => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR));

// 3. Accueil : nouvelle partie → création du personnage ; sinon écran « Continuer »
if (TEST) { document.title = 'World (test)'; state.ui.showWelcome(); }
else if (resumed) showStart();
else chooseLanguage(() => openCustomizer({ first: true })); // nouvelle partie : langue → personnage → introduction

window.world = world; // pratique pour déboguer dans la console
window.state = state;
