import { settings } from './settings.js';

// Traductions de l'interface. Le texte français sert de clé : t('Temps libre') → « Free time » en anglais.
// Une phrase absente du dictionnaire reste en français (les noms propres aussi).
// Variables : t('{n} postes libres', { n: 3 }).
// Les événements, le journal et les conversations des PNJ restent en français pour l'instant.

const EN = {
  // --- Interface générale ---
  'Temps libre': 'Free time',
  'Touche un lieu, une rue ou une personne.': 'Tap a place, a street or a person.',
  'En marche': 'Walking',
  'En route : {x}': 'On the way: {x}',
  'Routine': 'Routine',
  'Ta routine choisit la prochaine activité.': 'Your routine picks the next activity.',
  'Ma vie': 'My life',
  'Fermer': 'Close',
  'Arrêter': 'Stop',
  'Sortir dans la rue': 'Go out to the street',
  'Paramètres': 'Settings',
  // --- Bienvenue ---
  'Passer': 'Skip', 'Suivant': 'Next', 'C’est parti !': 'Let’s go!', 'Revoir l’accueil': 'Show welcome again',
  'Bienvenue dans World !': 'Welcome to World!',
  'Tu viens d’emménager dans le Marais, à Paris. Travaille, fais-toi des amis, deviens propriétaire… ou même maire ! Chaque habitant vit sa propre vie.': 'You just moved to the Marais, in Paris. Work, make friends, buy a home… or even become mayor! Every resident lives their own life.',
  'Comment jouer': 'How to play',
  'Touche la rue pour marcher, un bâtiment pour voir ce qu’on y fait, un habitant pour lui parler. Glisse pour bouger la carte, pince pour zoomer.': 'Tap the street to walk, a building to see what you can do there, a resident to talk to them. Drag to move the map, pinch to zoom.',
  'Prends soin de toi': 'Take care of yourself',
  'En haut : ton énergie, ta faim et ton moral. Dors, mange, détends-toi. À gauche : ton frigo, ton travail et ton logement.': 'At the top: your energy, hunger and mood. Sleep, eat, relax. On the left: your fridge, job and home.',
  'Tes objectifs': 'Your goals',
  'Suis les « Premiers pas » en haut à gauche, puis les objectifs du jour pour gagner de l’argent et de l’expérience. Le guide complet est dans ⚙️.': 'Follow the “First steps” at the top left, then the daily goals to earn money and experience. The full guide is in ⚙️.',
  // --- Écran d'accueil ---
  'Continuer': 'Continue', 'Modifier mon personnage': 'Edit my character', 'Nouvelle partie': 'New game',
  'Recommencer une nouvelle partie ? Ton argent et ta progression seront effacés.': 'Start a new game? Your money and progress will be erased.',
  // --- Paramètres ---
  'Langue': 'Language',
  'Son': 'Sound',
  'Volume': 'Volume',
  'Musique': 'Music',
  'Ambiances (ville, pluie, café)': 'Ambience (city, rain, café)',
  'Sons de l’interface': 'Interface sounds',
  'Vibrations': 'Vibrations',
  'Confort': 'Comfort',
  'Langue et affichage': 'Language & display', 'Batterie': 'Battery',
  'Plan des lieux': 'Places map', 'Habitants': 'Residents', 'Routine automatique': 'Automatic routine',
  'Mon style': 'My style', 'Recentrer sur moi': 'Center on me',
  'Astuces': 'Tips',
  'Les événements s’effacent après': 'Events disappear after',
  'jamais': 'never',
  'Taille du texte': 'Text size',
  'Petit': 'Small', 'Normal': 'Normal', 'Grand': 'Large',
  'Économie de batterie': 'Battery saver',
  'Moins de passants et de voitures ; résolution réduite au prochain lancement.': 'Fewer passers-by and cars; lower resolution on next launch.',
  'Activé': 'On', 'Coupé': 'Off',
  'Revoir les astuces': 'Show tips again',
  'Les astuces réapparaîtront.': 'Tips will show again.',
  // --- Astuces ---
  '📖 Perdu·e ? Le guide complet du jeu est dans ⚙️ Paramètres (en haut à droite).': '📖 Lost? The full game guide is in ⚙️ Settings (top right).',
  '🍔 Ton ventre gargouille : cuisine chez toi (🥫 = repas au frigo) ou va à la boulangerie.': '🍔 Your stomach is rumbling: cook at home (🥫 = meals in the fridge) or go to the bakery.',
  '⚡ Tu fatigues : rentre dormir, ou bois un café pour tenir jusqu’au soir.': '⚡ You are getting tired: go to bed, or have a coffee to last until evening.',
  '😊 Ton moral baisse : discute avec quelqu’un, regarde la télé, lis ou assieds-toi sur un banc.': '😊 Your mood is dropping: chat with someone, watch TV, read or sit on a bench.',
  '💶 Ton argent fond : travaille, ou demande l’aide sociale à la mairie si tu es sans emploi.': '💶 You are running out of money: work, or ask for welfare at city hall if unemployed.',
  '🧾 Ton loyer est à payer (le lundi) : touche 🏠 dans la colonne de gauche. Après 8 jours de retard, c’est l’expulsion.': '🧾 Your rent is due (on Mondays): tap 🏠 on the left. After 8 days late, you get evicted.',
  '🪑 À l’intérieur, touche un meuble pour l’utiliser : lit, canapé, télé, comptoir…': '🪑 Indoors, tap furniture to use it: bed, sofa, TV, counter…',
  '🌙 Il se fait tard : rentre dormir pour être en forme demain.': '🌙 It is getting late: go to bed to be fit tomorrow.',
  '🗳️ Élections municipales : va voter à la mairie 🏛️ (et tu peux même te présenter !).': '🗳️ Local elections: go vote at city hall 🏛️ (you can even run!).',
  '🗺️ Le bouton 🗺️ (à droite) liste tous les lieux du quartier, 👥 tous les habitants.': '🗺️ The 🗺️ button (right) lists every place in the neighbourhood, 👥 every resident.',
  '🔁 Le bouton 🔁 (à droite) lance la routine : ton personnage mange, dort et travaille tout seul.': '🔁 The 🔁 button (right) starts the routine: your character eats, sleeps and works alone.',
  '🌟 Tes rêves sont dans « Ma vie » (💼 à gauche) : chacun rapporte une récompense.': '🌟 Your dreams are in “My life” (💼 on the left): each one gives a reward.',
  // --- Objectifs du jour, niveau ---
  'Objectifs du jour': 'Daily goals', 'Journée parfaite': 'Perfect day', 'Niv.': 'Lv', 'Niveau': 'Level',
  'prochain niveau à': 'next level at',
  'les objectifs du jour, les rêves et les premiers pas font gagner de l’expérience.': 'daily goals, dreams and first steps earn experience.',
  'Termine ton service': 'Finish your shift', 'Cuisine un repas chez toi': 'Cook a meal at home', 'Discute avec 2 personnes': 'Chat with 2 people',
  'Prends du temps pour toi': 'Take some time for yourself', 'Achète chez 2 commerçants': 'Buy from 2 local shops', 'Fais plaisir à quelqu’un': 'Do something nice for someone',
  'Nourris les pigeons': 'Feed the pigeons', 'Suis un cours à l’école': 'Take a class at school', 'Profite de la fête du quartier': 'Enjoy the neighbourhood festival',
  'Dors une vraie nuit chez toi': 'Get a real night’s sleep at home',
  'Nouveau venu': 'Newcomer', 'Habitant·e': 'Resident', 'Voisin·e apprécié·e': 'Well-liked neighbour', 'Figure du quartier': 'Local figure',
  'Pilier du Marais': 'Pillar of the Marais', 'Célébrité locale': 'Local celebrity', 'Légende du Marais': 'Legend of the Marais',
  'Mémoire du Marais': 'Memory of the Marais', 'Âme du Marais': 'Soul of the Marais',
  'Guide': 'Guide', 'Guide du jeu': 'Game guide',
  // --- Carte d'objectif, rêves ---
  'Premiers pas': 'First steps',
  'Prochain rêve': 'Next dream',
  'Rêve réalisé !': 'Dream come true!',
  '👀 Montrer': '👀 Show me',
  '🎁 Récupérer': '🎁 Collect',
  'Mes rêves': 'My dreams',
  'Termine d’abord tes premiers pas (en haut à gauche) : tes rêves se débloquent ensuite.': 'Finish your first steps first (top left): your dreams unlock afterwards.',
  'Prends un petit-déjeuner': 'Have breakfast',
  'Va travailler': 'Go to work',
  'Fais des courses': 'Buy groceries',
  'Cuisine chez toi': 'Cook at home',
  'Discute avec un voisin': 'Chat with a neighbour',
  'Dors chez toi': 'Sleep at home',
  'Dans un café ☕ ou une boulangerie 🥐 ouverts (les boulangeries ferment le lundi), ou cuisine chez toi.': 'In an open café ☕ or bakery 🥐 (bakeries close on Mondays), or cook at home.',
  'Ton service commence à l’heure indiquée sur 💼 en bas à gauche. Touche ton lieu de travail, puis « Travailler ».': 'Your shift starts at the time shown on 💼. Tap your workplace, then “Work”.',
  'À la supérette 🛒 : 4 repas pour ton frigo (🥫 en bas à gauche).': 'At the grocery store 🛒: 4 meals for your fridge (🥫).',
  'Rentre chez toi 🏠 et touche la cuisinière, ou « Cuisiner » dans la fiche.': 'Go home 🏠 and tap the stove, or “Cook” in the panel.',
  'Touche un habitant dans la rue, puis un sujet de conversation.': 'Tap a resident in the street, then a topic.',
  'Le soir, rentre chez toi et touche le lit (ou « Dormir »).': 'In the evening, go home and tap the bed (or “Sleep”).',
  'Avoir 5 ami·e·s': 'Have 5 friends',
  'Obtenir 2 augmentations': 'Get 2 raises',
  'Avoir 3 tenues ou accessoires': 'Own 3 outfits or accessories',
  'Devenir propriétaire': 'Own your home',
  'Avoir 10 000 € de côté': 'Save €10,000',
  'Rouler en voiture': 'Drive a car',
  'Être élu·e maire': 'Get elected mayor',
  // --- Plan, répertoire ---
  'Plan · {x}': 'Map · {x}',
  'Habitants · {n}': 'Residents · {n}',
  '☕ Manger et boire': '☕ Food and drink',
  '🛍️ Boutiques': '🛍️ Shops',
  '💼 Travail': '💼 Work',
  '🏛️ Services': '🏛️ Services',
  '🏠 Logements': '🏠 Homes',
  '🟢 ouvert': '🟢 open',
  '🔴 fermé': '🔴 closed',
  'dans la rue': 'in the street',
  'à la maison': 'at home',
  // --- Actions (étiquettes des boutons) ---
  'Marcher': 'Walk', 'Sur place': 'Here', 'Entrer': 'Enter', 'Sortir': 'Go out', 'Travailler': 'Work',
  'Heures sup (+25 %)': 'Overtime (+25%)', 'Se déclarer malade': 'Call in sick', 'Démissionner': 'Quit job', 'Postuler': 'Apply',
  'Un café': 'A coffee', 'Déjeuner': 'Lunch', 'Sandwich': 'Sandwich', 'Courses (4 repas)': 'Groceries (4 meals)',
  'Ticket à gratter': 'Scratch card', 'Cuisiner': 'Cook', 'Dormir': 'Sleep', 'Sieste': 'Nap',
  'Regarder la télé': 'Watch TV', 'Lire un livre': 'Read a book', 'S’asseoir sur le banc': 'Sit on the bench',
  'Nourrir les pigeons': 'Feed the pigeons', 'Faire un vœu (1 €)': 'Make a wish (€1)', 'Dormir au métro': 'Sleep in the metro',
  'Voyager': 'Travel', 'Payer le loyer': 'Pay rent', 'Louer (1re semaine)': 'Rent (1st week)', 'Acheter': 'Buy',
  'Discuter': 'Chat', 'Saluer': 'Wave', 'Plaisanter': 'Joke', 'Offrir un cadeau': 'Give a gift', 'Se balader': 'Take a walk',
  'Inviter à un café': 'Buy a coffee', 'Faire du shopping': 'Go shopping', 'Réviser mon véhicule': 'Service my vehicle',
  'Demander l’aide sociale': 'Ask for welfare', 'Voter': 'Vote', 'Se présenter à la mairie': 'Run for mayor',
  'Admirer la statue': 'Admire the statue', 'Acheter des produits frais': 'Buy fresh produce', 'Une crêpe au sucre': 'A sugar crêpe',
  'Chiner (10 €)': 'Hunt for bargains (€10)', 'Danser': 'Dance', 'Voler son portefeuille (risqué)': 'Pick their pocket (risky)',
  'Voler à l’étalage (risqué)': 'Shoplift (risky)', 'Cambrioler (la nuit, très risqué)': 'Burgle (at night, very risky)',
  'Arrêter': 'Arrest', 'Porter plainte': 'File a complaint', 'Éteindre l’incendie': 'Put out the fire',
  'Consulter un médecin': 'See a doctor', 'Suivre un cours (2 h)': 'Take a class (2 h)', 'En prison': 'In prison',
  'Récupérer la récompense': 'Collect reward',
  'Regarder': 'Look', 'S’asseoir un moment': 'Sit for a while', 'Un en-cas au distributeur': 'A snack from the machine',
  'Boire un verre d’eau': 'Drink some water', 'Feuilleter un livre': 'Browse a book', 'Arroser la plante': 'Water the plant',
  'Sortir de la boutique': 'Leave the shop', 'Poste': 'Job', 'Rejoindre': 'Join', 'Y aller': 'Go there',
  'Activer la routine': 'Turn routine on', 'Désactiver la routine': 'Turn routine off',
  // --- Fiches ---
  '✨ Interagir': '✨ Interact',
  '🔁 Routine automatique': '🔁 Automatic routine',
  'Ton personnage mange, dort et va travailler tout seul. Tu peux toujours reprendre la main.': 'Your character eats, sleeps and goes to work alone. You can take over anytime.',
  '🚲 Déplacements': '🚲 Getting around',
  '🛍️ Boutique': '🛍️ Shop',
  '🏛️ La mairie': '🏛️ City hall',
  'Touche un meuble ou une personne.': 'Tap furniture or a person.',
};

const DICTS = { en: EN };

export const lang = () => settings().lang;

export function t(s, vars) {
  if (s == null) return s;
  const d = DICTS[lang()];
  let out = d && d[s] != null ? d[s] : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}

export const LANGS = [['fr', 'Français'], ['en', 'English']];
