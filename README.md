# World

Jeu mobile de simulation de vie, dans le Marais à Paris. Prototype jouable dans le navigateur.

## Lancer

```bash
npm start
```

Puis ouvre http://localhost:5173. Pour tester sur ton téléphone (même Wi-Fi), ouvre `http://<IP-de-ton-PC>:5173`.

## Jouer
- **Glisser** pour déplacer la carte, **pincer** (ou molette) pour zoomer.
- **Toucher une rue** : ton personnage (flèche jaune) y marche.
- **Toucher un lieu** (ou son icône) : la fenêtre en bas à droite propose ce qu'on peut y faire.
- Les **événements** arrivent dans cette même fenêtre : à toi de choisir.
- Quand tu es occupé dans un lieu (travail, sommeil), le temps accélère automatiquement.
- En haut : heure et jour, météo, argent, énergie ⚡, satiété 🍔, repas au frigo 🥫, travail 💼, logement 🏠. Touche 💼 ou 🏠 pour ouvrir « Ma vie ».
- **Travail** : service de 8 h à heure fixe. Absences, retards ou départs anticipés = avertissement ; au 3e, tu es renvoyé·e. Dix jours sans faute = augmentation. Pour retrouver un emploi : touche un commerce et « Postuler ».
- **Logement** : le loyer de la semaine tombe le lundi. Sans paiement : relance, puis expulsion. Tu peux aussi acheter ton logement, ou louer / acheter un logement libre (🔑 sur la carte).
- **Gens** : touche un habitant pour discuter, offrir un café ou demander un tuyau. Les amis t'invitent, te recommandent pour un poste…
- **Routine** 🔁 : ton personnage mange, dort et va travailler tout seul.

## Parler librement aux habitants (IA)
Touche un habitant et écris ce que tu veux. Sans configuration, des réponses intégrées (gratuites) répondent.
Pour des PNJ vraiment vivants (Claude, modèle Opus 5.5), lance le serveur avec une clé API Anthropic :

```bash
set ANTHROPIC_API_KEY=ta_clé
npm start
```

La clé reste sur ton ordinateur (serveur local), jamais dans le navigateur. Compte environ 1 à 3 centimes par réplique.
Ce que tu écris aux PNJ est envoyé à l'API d'Anthropic pour générer leur réponse.

## Modifier le quartier
Édite la grille dans `src/map/quartier.js` : une lettre majuscule = un bâtiment, déclaré dans `buildings`.
