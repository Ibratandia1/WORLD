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
import { settings, onSettings } from './settings.js';
import { t } from './i18n.js';
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
const qs = new URLSearchParams(location.search);
const want3D = !qs.has('2d'); // la ville est en 3D pour tout le monde ; ?2d = ancienne vue (secours, tests)
state.want3D = want3D; // GameScene ne construit pas la carte 2D quand la ville est en 3D
const DPR = settings().saver ? 1 : Math.min(window.devicePixelRatio || 1, 2); // économie de batterie : résolution simple
state.dpr = DPR;
const game = new Phaser.Game({
  type: want3D ? Phaser.HEADLESS : Phaser.AUTO, // 3D : moteur 2D sans aucun affichage (logique seulement)
  parent: 'game',
  transparent: true,
  scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
  render: { antialias: true, antialiasGL: true },
  input: { activePointers: 3 },
  scene: [GameScene, InteriorScene, FxScene],
});
window.addEventListener('resize', () => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR));
// Ouvert téléphone à la verticale (écran « Tourne ton téléphone ») : quand on le tourne, on redémarre
// proprement en paysage (sinon la carte et les fenêtres gardent les dimensions de l'écran vertical)
const bootPortrait = window.innerHeight > window.innerWidth && matchMedia('(pointer: coarse)').matches;
if (bootPortrait) {
  const check = () => { if (window.innerWidth > window.innerHeight) location.reload(); };
  window.addEventListener('resize', () => setTimeout(check, 300));
  window.addEventListener('orientationchange', () => setTimeout(check, 500));
}

// 2b. La ville en 3D (Three.js) : elle remplace le dessin 2D de la carte (la scène Phaser continue de faire
// tourner la simulation, les intérieurs et la météo). ⚙️ → Batterie → « Ville en 3D » pour revenir à la 2D.
if (want3D) {
  import('./city3d.js').then(({ startCity3D }) => {
    const sc = () => state.scene;
    state.city3d = startCity3D(world, {
      player, saver: settings().saver,
      // Toucher un lieu : on y va et on entre directement ; un logement qui n'est pas le tien ouvre sa petite fiche (louer)
      onPlace: b => {
        if (b.type === 'home' && b.id !== player.home) return state.ui.showPlace(b);
        const ok = world.check(player, 'enter', { building: b.id });
        if (ok === true) { state.ui.closePanels && state.ui.closePanels(); world.perform(player, 'enter', { building: b.id }); return state.ui.render(); }
        if (player.inside === b.id) return;
        state.city3d.floatText(t(typeof ok === 'string' ? ok : 'Pas possible'), '#e2475b');
        state.ui.showPlace(b); // fermé, en feu… : la fiche dit quand ça ouvre
      },
      onPerson: a => state.ui.showPerson(a),
      // sol, objets de la rue, stands des fêtes : mêmes réactions que la vue 2D
      onTile: (x, y, tile) => sc() && sc().tapTile(x, y, tile),
      festSpots: () => (sc() && sc().fest ? sc().fest.spots : []), // stands des fêtes (mêmes places que la 2D)
      // Intérieurs en 3D : la scène InteriorScene fournit la pièce, les postes et la réponse aux touchers
      interiorCtx: () => (state.interior ? state.interior.ctx3d() : null),
      onInteriorTap: (x, y, id) => state.interior && state.interior.tapTile3d(x, y, id),
      onLeave: () => { world.perform(player, 'leave'); state.ui.render(); },
    });
    document.body.classList.add('v3d');
    // L'ancienne 2D (Phaser) n'est plus dessinée du tout : elle ne garde que la logique (simulation, intérieurs, toucher)
    const hide2D = () => {
      const g = state.scene && state.scene.game;
      if (!g) return setTimeout(hide2D, 200);
      for (const k of ['game', 'interior', 'fx']) { const s = g.scene.getScene(k); if (s) s.sys.setVisible(false); }
      if (g.canvas) g.canvas.style.display = 'none'; // (en mode sans affichage, il n'y a même plus de canvas)
    };
    hide2D();
    if (sc()) { sc().shownInterior = undefined; for (const id of Object.keys(world.safety ? world.safety.fires : {})) state.city3d.showFire(world.building(+id)); }
    world.on('fire', e => state.city3d.showFire(e.building));
    world.on('fireOut', e => state.city3d.hideFire(e.building));
    state.city3d.centerOnPlayer();
  }).catch(err => { // sans réseau (Three.js depuis le CDN) : on relance en 2D
    console.warn('3D indisponible, vue 2D', err);
    const q = new URLSearchParams(location.search); q.set('2d', ''); q.delete('3d');
    location.replace(`${location.pathname}?${q.toString()}`);
  });
}
// Changer de vue redémarre le jeu (la partie est sauvegardée en quittant)
// (le réglage 2D / 3D a été retiré : la 3D est la seule vue)

// 3. Accueil : nouvelle partie → création du personnage ; sinon écran « Continuer »
if (TEST) { document.title = 'World (test)'; state.ui.showWelcome(); }
else if (resumed) showStart();
else chooseLanguage(() => openCustomizer({ first: true })); // nouvelle partie : langue → personnage → introduction

window.world = world; // pratique pour déboguer dans la console
window.state = state;
