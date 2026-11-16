# World — notes pour Claude

Jeu mobile de simulation de vie (travailler, voyager, acheter, devenir riche ou pauvre).
Décisions par événements. Départ à Paris : vrais quartiers, commerces et marques aux noms **inventés**.
Solo d'abord, puis multijoueur où de vrais joueurs remplacent des PNJ (côté jeu de rôle).
L'utilisateur parle français : répondre en français, textes du jeu en français.

## Décisions fixées
- Phaser 3 dans le navigateur (CDN, pas de bundler pour l'instant), pensé mobile tactile ; emballage Google Play plus tard (Capacitor).
- Écran paysage, grande carte isométrique, barre d'icônes **sans texte** en haut, événements dans une petite fenêtre en bas à droite.
- **Règle d'or** : joueur et PNJ utilisent les mêmes actions. Tout passe par `world.perform(actor, id, params)` ; un acteur ne diffère que par `controller` (`player` / `ai` / plus tard `remote`). Ne jamais ajouter d'effet de jeu qui contourne `ACTIONS`.
- Carte : grille texte (actuel) → Tiled → génération OpenStreetMap. `parseMap` produit le format commun.

## Architecture
- `src/sim/` : simulation pure JS, **aucune dépendance à Phaser ni au DOM** (pour tourner un jour côté serveur).
  - `actions.js` catalogue des actions · `world.js` temps (jour 1 = lundi), météo, déplacements · `ai.js` choix des PNJ **et** routine auto du joueur
  - `jobs.js` contrats (service de 8 h, jours travaillés, avertissements → renvoi au 3e, augmentation tous les 10 jours sans faute, candidatures)
  - `housing.js` loyer hebdo le lundi, relance à 4 j de retard, expulsion à 8 j, location / achat
  - `social.js` relations 0–100 entre habitants, proximité, répliques des PNJ selon leur situation
  - `events.js` événements **contextuels** (aucun tirage purement aléatoire) + conséquences poussées par le monde ; délai mini entre deux événements
  - `people.js` habitants de départ
- Rythme : 1,5 min de jeu / s ; pendant une action du joueur le temps accélère selon `skip` (travail ×6, sommeil ×16).
- `src/map/` : `quartier.js` (grille texte du Marais, tracé organique), `types.js` (apparence par type de lieu), `parse.js`
- `src/scenes/GameScene.js` : rendu iso (textures générées), toucher → action ; bascule vers l'intérieur quand `player.inside` change
- Intérieurs : **dessinés par le code, en un seul plan structuré par étage** (l'utilisateur a refusé les illustrations « trop IA » ; `assets/interiors.webp` n'est plus utilisé). Filtre pixel art (`PIXELATE` dans InteriorScene) sur la caméra de la pièce ; une 2e caméra affiche les étiquettes nettes (calques `worldLayer` / `uiLayer` : tout nouvel objet doit aller dans l'un des deux via `w()` / `u()`).
- Étages : un plan peut avoir `floors` (bureau : RDC accueil + cafétéria, 1er open space, 2e réunion + direction ; logement : hall + appartement). Boutons d'étage à gauche, la vue suit l'étage du joueur, le socle montre la façade des étages inférieurs.
- Écran d'accueil (`src/start.js`) : Continuer / Modifier mon personnage / Nouvelle partie ; sans sauvegarde, la création du personnage s'ouvre directement.
- HUD : en haut à gauche l'essentiel, en haut à droite le temps, en bas à gauche frigo / travail / logement / routine / tenue / recentrer.
- `src/city/render.js` : rendu détaillé de la ville (façades, balcons, toits, ombres, trottoirs, passages piétons, lampadaires, terrasses, fontaine, voitures décoratives, fenêtres allumées la nuit).
- `src/scenes/InteriorScene.js` + `src/interiors/` : intérieurs détaillés (plans par type dans `layouts.js`, meubles dans `furniture.js`). Les PNJ présents occupent des « stations » selon leur action ; toucher un meuble lance son action.
- Entrer / rester / sortir : actions `enter`, `stay` (état après une action), `leave`. `actor.doing` = action réelle (null si juste « sur place »).
- ⚠ `actor.inside` peut valoir 0 : tester `actor.outdoors`, jamais `!actor.inside`.
- `src/look.js` + `src/customize.js` : apparence pixel art (16×28) et éditeur de personnage, profil sauvé dans localStorage (`world.profile`).
- `src/camera.js` : glisser / pincer / toucher, partagé par les scènes
- Sauvegarde : `src/sim/snapshot.js` (photo JSON du monde, sans stockage — réutilisable côté serveur) + `src/save.js` (localStorage `world.save`, toutes les 10 s, à chaque jour, en quittant). Ajouter tout nouvel état d'acteur à `ACTOR_FIELDS` et augmenter `SNAPSHOT_VERSION` si le format change.
- `src/ui.js` : HUD et fenêtre d'événements en HTML par-dessus le canvas
- Lancer : `npm start` → http://localhost:5173 (serveur `server.mjs`, config preview : `.claude/launch.json`)
- Rendu net : le canvas est à la résolution réelle de l'écran (`state.dpr`, `scale.zoom = 1/dpr`). Les marges d'interface en pixels CSS doivent être multipliées par `state.dpr` côté Phaser.
- Boutiques : `src/sim/catalog.js` (tenues, chapeaux, véhicules, smartphone) ; action `buy` (en boutique), `use_vehicle`. Véhicule = vitesse ×N dans la rue + assurance le lundi. Maison Plume (Y) et Garage Roue Libre (V) dans la rue ajoutée au sud.
- Métiers : `role` des habitants (manager, landlord, police, postman). Métiers de rue = `job.street` (tournée, payés dehors pendant le service). ⚠ Nouveaux habitants et bâtiments toujours AJOUTÉS À LA FIN (ids stables pour les sauvegardes).
- Conversation libre : `src/chat.js` (fiche du PNJ + réponses intégrées hors-ligne + application des actions via `world.perform`) et `server.mjs` (`POST /api/chat`, SDK Anthropic, `claude-opus-5-5`, sortie JSON structurée, effort low, fallback serveur). Sans clé : 503 → réponses intégrées.
- Oiseaux et pigeons : `Birds` dans `src/city/render.js`.
- Discussions : `talk` fait s'arrêter l'autre (`listen`, si `canPause` : pas au travail, pas juste avant son service). Bulles `actor.bubble` (+ `bubbleHold`) affichées sur la carte et en intérieur. Ouvrir la fiche d'un PNJ ou lui écrire l'arrête (`engage` dans chat.js).
- Rythme : 1 min de jeu / s (journée ≈ 24 min), marche 1,6 case / min de jeu. Pas de filtre pixel dans les intérieurs (flou).
- Nuit : fenêtres / vitrines (calque `lg` par bâtiment), halos et flaques de lumière des lampadaires (blend ADD), voile de nuit DOM limité à 0,34.
- ⚠ Tests : utiliser **http://localhost:5173/?test** (partie neuve jamais sauvegardée). Sans `?test`, c'est la vraie partie de l'utilisateur.
- Pas de noms ni de bulles au-dessus des têtes (demande utilisateur) ; le joueur a une flèche + un anneau jaune au sol.
- Personnages : dessin 16×28 + contour sombre → textures 18×30 ; 3 images (debout, `_1`, `_2` = marche). `drawCharacter(look, rect, frame)`.
- Poses façon Sims (intérieurs) : `POSES` dans look.js (assis, vu de dos, livre, poêle, tasse, fourchette, clavier), créées à la demande par `ensurePose`. `poseFor(action, station)` dans InteriorScene ; stations avec `seat`, `pose`, `table`, `lieAngle`. « Cuisiner » = phase `cook` aux fourneaux puis repas à table. Effets : écran de télé, vapeur, Zzz, assiette. ⚠ « cook » n'est pas une action : toujours prévoir un repli quand on lit `ACTIONS[act]`.
- Les PNJ ne doivent pas importuner le joueur : ils ne lancent jamais de discussion avec lui ; l'événement « salut » est rare (amis seulement, 1 fois / 3 jours / personne) ; délai mini entre événements 120 min.
- Moral (`actor.mood`, jauge 😊) : s'use avec le travail, les dettes, la faim, l'absence de logement ; remonte avec discussions, loisirs (télé, livre, banc), repas, cadeaux. Influence l'embauche et l'énergie ; événement « Coup de blues » ; la routine et les PNJ se détendent quand il est bas.
- Interactions : PNJ (saluer, plaisanter, cadeau, café, balade — débloqués par la relation), objets d'intérieur à plusieurs usages (`actions: [...]` dans layouts.js → menu), objets de rue (bancs, fontaine, pigeons via `scene.spots` / `birds.pigeons`) avec « Y aller » si trop loin. Cadeaux = articles `consumable` de la supérette (`actor.gifts`).
- Git : dépôt initialisé (branche main). Le dossier « game world » (autre dépôt vide de l'utilisateur) est ignoré.
- Conversation : thèmes (`TOPICS` dans chat.js) → réponse du PNJ + choix de réponses (`choices` : react/rel/topic). Avec l'IA, le serveur renvoie aussi `suggestions` (réponses proposées au joueur).
- Nuit : obscurité dans Phaser, pas en DOM. `twin()` (render.js) double chaque dessin d'un calque couleur nuit juste au-dessus ; les lumières sont dessinées encore au-dessus. Rectangle d'obscurité du sol à la profondeur 0,55 ; sprites teintés via `scene.nightTint`.
- Commerces : actions `seller: true` = il faut un employé en service dans le lieu (`sellerAt`). Équipes du matin / du soir (`SHIFTS.alt`) : ouvert ~6h–22h.
- Impôts : `incomeTax` (prélèvement à la source, barème selon le salaire horaire) sur tous les salaires ; taxe foncière hebdo des propriétaires ; bilan le lundi (`taxBill`) ; `world.treasury`.
- Débogage : `window.world` dans la console ; `world.step(1)` en boucle pour simuler vite.
- Tracé organique (carte 36×30, `layout: 2`) : rues en coude / baïonnette (`=`), ruelles et places pavées (`:` = sol `cobble`), place du Marché (fontaine), place des Vosges. Plan conçu avec un petit script « peintre » puis collé en lignes. ⚠ `order` dans quartier.js fixe les ids des bâtiments (ajouter les lettres À LA FIN). Changer `layout` replace les acteurs des vieilles sauvegardes (`nearestWalkable`).
- Logements : `units` = appartements ; `freeUnits(w, b)` (city.js) pour louer, icône 🔑 s'il en reste.
- Chemins : Dijkstra, la rue coûte 4 (on marche sur les trottoirs, on traverse au plus court). PNJ flânent via `randomFootpath`.
- Rendu des rues dans les 4 sens : bordures, passages piétons avant les carrefours, pointillés, lampadaires des deux côtés, lanternes sur les places. `Traffic` suit le graphe des rues (file de droite, virages, freinage, entrées/sorties par les bords) ; `Crowd` = passants de décor (non cliquables) ; densité selon `cityPulse(heure)`.
- Ville vivante : `src/sim/city.js` (`world.city`). Ventes comptées via l'événement `done` (`cost`, `where`) ; prix `priceMul` ajustés le lundi selon la clientèle (cafés, boulangeries, supérettes) ; faillite si < 1,5 client/jour sur 7 jours (après 10 jours avec équipe) → `bizClosed`, local repris 3–5 j plus tard sous un nouveau nom (`bizOpened`). Arrivées (métro, quand il y a travail + logement), départs après 4 jours difficiles (`removeActor`, ids dans `city.gone`). Nouveaux arrivants : ids `n1, n2…`, recréés depuis la sauvegarde. Journal du quartier = événement `journal` le matin.
- L'État : `src/sim/gov.js` (`world.gov`). Mairie du Marais (Z, type `cityhall`, ouverte lun–sam) avec la statue de Marianne devant (sol `x` = déco `statue`, `drawStatue`, touchable : `admire_statue`). Maire = `gov.mayor` (rôle `mayor`, M. Delorme au départ), indemnité hebdo payée par le Trésor. Politique : impôts bas/normaux/hauts (`gov.taxMul` dans `incomeTax`) et aides (`allocation`, sans emploi et < 300 €, 1×/semaine). Élections tous les 14 jours : candidatures 5 j avant (`run_mayor`), vote les 3 derniers jours (`vote`, params `for`), dépouillement le lendemain (`electionResult`). Les PNJ votent selon leurs relations et leur moral (`gov.choose`). Maire joueur : `set_policy` à la mairie. Actions `custom: true` = pas de bouton générique dans la fiche du lieu (`govHTML`).
- Vraies cartes (essai) : `tools/ign-fetch.mjs` télécharge la BD TOPO® de l'IGN (WFS Géoplateforme data.geopf.fr, sans compte) dans `data/ign/` ; `tools/ign-to-grid.mjs` en fait une grille (6 m/case, rues élargies + trottoirs pour la lisibilité) ; aperçu isométrique : http://localhost:5173/preview-ign.html. **Essai refusé par l'utilisateur** (trop dense, pas assez personnalisé) : les quartiers restent dessinés à la main ; les vraies données servent au mieux d'inspiration. Crédit obligatoire : « Source : IGN – BD TOPO® » (Licence Ouverte 2.0).
- Objectifs : `src/sim/goals.js`. « Premiers pas » (6 étapes, `TUTORIAL`, flags remplis par les événements `start`/`done` via `trackGoals`) puis « Rêves » (`DREAMS`, progress(a, w)). Récompenses uniquement via l'action `claim_goal` (params `goal: 'tut' | id du rêve`). Partie reprise après le jour 3 : tutoriel considéré comme fait. Nouvelle partie : 25 min simulées avant de prendre la main (commerces ouverts).
- UI d'aide : carte d'objectif `#quest` (en haut à gauche, « Montrer » → `scene.focusBuilding` / `focusActor` avec flèche), astuces `#tip` (une à la fois, chacune une seule fois, mémorisées dans `player.tips`), pastille « prochain rendez-vous » `#p-next` (loyer, vote, service imminent), jauges critiques qui clignotent (`.crit`), plan des lieux 🗺️ et répertoire 👥 (`mapHTML` / `peopleHTML`).
- Équilibre (testé sur 35 jours) : moral des conversations +0,06/min et le moral redescend au-dessus de 75 ; augmentation tous les 15 jours sans faute, plafond 130 % ; TVA 15 % des ventes pour la ville (`VAT`) ; agents de la mairie payés par le Trésor (police et facteur : par l'État) ; entretien des rues 6 €/habitant/semaine ; projets du maire (`PROJECTS` : fête, fleurs, prime ; un par semaine) ; dépenses `shopping` (mode) et `repair` (garage, assurance moitié prix).
- Les PNJ choisissent leur commerce (`shop()` dans ai.js : distance, prix, adresse préférée `a.fav`) et passent `params.at` ; le panneau d'un lieu passe aussi `at` (on achète ici, pas au plus proche).
