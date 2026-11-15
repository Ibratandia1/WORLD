# Sprites de la ville à générer

Objectif : remplacer les bâtiments et le décor dessinés par le code par des images dans le style de l'illustration de rue de référence.
Dépose les fichiers dans `assets/city/` avec exactement les noms ci-dessous : je les branche ensuite dans le jeu.

## Règles communes (très important)

1. **Un seul objet par image**, entier, centré, rien autour (pas de rue, pas de trottoir, pas de voisins).
2. **Fond transparent** (PNG). Si l'outil ne sait pas faire : fond **uni magenta `#FF00FF`**, je le retire automatiquement.
3. **Vue isométrique standard 2:1** : le sol d'une case est un losange **deux fois plus large que haut**. On voit le toit, la façade gauche et la façade droite (comme dans l'image de référence).
4. **Lumière venant d'en haut à gauche** : façade gauche claire, façade droite plus sombre, petite ombre douce au pied.
5. **Aucun texte** sur les enseignes (les IA déforment les lettres, et les noms sont affichés par le jeu). Enseignes avec pictogrammes seulement. **Aucune vraie marque.**
6. **Même style partout** : joindre l'illustration de rue comme référence de style à chaque génération.
7. **Taille** : largeur indiquée ci-dessous (4× la taille du jeu, pour rester net quand on zoome). La hauteur est libre. Le bas de l'image = le sol.

Largeur d'un bâtiment = (cases en largeur + cases en profondeur) × 128 px.

## 1. Bâtiments (priorité)

| Fichier | Lieu du jeu | Emprise | Largeur | Description |
|---|---|---|---|---|
| `home_haussmann_a.png` | Logements | 2×2 | 512 px | Immeuble haussmannien de 4 étages, pierre crème, balcons en fer forgé noir, toit en zinc bleu-gris avec cheminées |
| `home_haussmann_b.png` | Logements | 2×2 | 512 px | Même style, pierre beige plus chaude, volets |
| `home_haussmann_c.png` | Logements | 2×2 | 512 px | Même style, façade gris clair, rez-de-chaussée avec grande porte cochère en bois |
| `home_haussmann_wide.png` | Résidence rue Saint-Antoine | 3×2 | 640 px | Version plus large du haussmannien |
| `home_loft.png` | Loft quai des Célestins | 2×2 | 512 px | Ancien entrepôt en brique rénové, grandes verrières, plantes sur le toit |
| `cafe_terrace.png` | Café Lumière | 2×2 | 512 px | Café parisien, auvent rayé rouge et blanc, grandes vitrines éclairées, terrasse avec petites tables rondes |
| `cafe_bistro.png` | Le Petit Zinc | 2×2 | 512 px | Bistrot à l'ancienne, devanture en bois vert foncé, auvent bordeaux |
| `bakery_a.png` | Boulangerie Dorée | 2×2 | 512 px | Boulangerie, devanture dorée et crème, vitrine pleine de pains et viennoiseries, auvent jaune |
| `bakery_b.png` | Fournil des Archives | 2×2 | 512 px | Boulangerie artisanale, devanture bleu nuit, auvent rayé |
| `superette.png` | Supérette Prixdoux | 3×2 | 640 px | Petite supérette moderne, auvent vert, fruits et légumes en étal devant la vitrine |
| `office_glass.png` | Néoplex Bureaux | 4×3 | 896 px | Immeuble de bureaux moderne de 6 étages, façade vitrée bleutée, climatiseurs sur le toit |
| `office_studio.png` | Atelier Kubik | 2×2 | 512 px | Studio créatif en brique et métal noir, grandes fenêtres d'atelier, plantes |
| `metro_entrance.png` | Métro Saint-Paul | 2×1 | 384 px | Entrée de métro parisienne style Art nouveau (Guimard), garde-corps vert, lampadaires en forme de tiges, escalier descendant |

## 2. Décor de rue

| Fichier | Largeur | Description |
|---|---|---|
| `tree_green.png` | 192 px | Arbre d'alignement parisien, feuillage rond vert |
| `tree_blossom.png` | 192 px | Cerisier en fleurs rose |
| `bush.png` | 128 px | Petit buisson fleuri |
| `streetlamp.png` | 96 px | Lampadaire parisien noir à l'ancienne |
| `bench.png` | 192 px | Banc public en bois et fonte, orienté le long de la rue |
| `planter.png` | 160 px | Bac à fleurs en pierre avec fleurs colorées |
| `fountain.png` | 256 px | Fontaine de square, bassin en pierre, jets d'eau |
| `trash_bin.png` | 80 px | Poubelle de rue parisienne vert foncé |
| `morris_column.png` | 128 px | Colonne d'affichage parisienne verte (affiches sans texte lisible) |
| `newsstand.png` | 256 px | Kiosque à journaux parisien vert |
| `terrace_table.png` | 160 px | Petite table ronde de terrasse, 2 chaises, parasol |
| `bike_rack.png` | 192 px | Range-vélos avec 2 vélos |

## 3. Voitures

Chaque voiture en **2 images** : une qui roule vers le bas à droite (`_dr`), une vers le haut à gauche (`_ul`). Largeur 256 px.

`car_red_dr.png`, `car_red_ul.png`, `car_blue_dr.png`, `car_blue_ul.png`, `car_white_dr.png`, `car_white_ul.png`, `taxi_dr.png`, `taxi_ul.png` (taxi sans logo de marque).

## 4. Facultatif : le sol

Les sols (trottoir, rue, herbe, eau) doivent se raccorder parfaitement d'une case à l'autre, ce que les IA font mal. **Je conseille de les garder dessinés par le code** pour l'instant. Si tu veux essayer : losanges de 256 × 128 px, sans aucun bord visible, `ground_pave.png`, `ground_road.png`, `ground_grass.png`, `ground_water.png`.

## Ce qui ne change pas

Les **personnages** restent en pixel art générés par le jeu : c'est ce qui permet de les personnaliser (peau, coiffure, vêtements…).

## Modèle de consigne (en anglais, les générateurs le comprennent mieux)

> Isometric game asset, single [OBJET] isolated and centered, standard 2:1 isometric projection, viewed from above showing roof, left facade and right facade, light from top-left, soft shadow at the base, highly detailed cozy painted pixel-art style matching the reference image, warm colors, no text, no letters, no logos, no brand names, nothing else in the image, transparent background.

Exemple pour `cafe_terrace.png` : remplacer `[OBJET]` par
*"Parisian café building, 2 floors, red and white striped awning, large glowing shop windows, small round terrace tables in front, cream stone facade with black wrought-iron balconies, grey zinc roof"*.

## Conseils

- Commence par **2 ou 3 images** (par exemple `home_haussmann_a`, `cafe_terrace`, `tree_green`) : je les intègre et on vérifie ensemble l'échelle et l'angle avant de tout générer.
- Si l'angle ne colle pas, régénère plutôt que retoucher : un angle faux se voit tout de suite dans la ville.
