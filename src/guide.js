// Guide du jeu (onglet « Guide » des paramètres) : une rubrique par grand sujet, en français et en anglais.
// [icône, titre, texte] — le texte peut contenir des retours à la ligne (une ligne = une puce).

export const GUIDE = {
  fr: [
    ['🎯', 'Bien démarrer', [
      'Tu arrives dans le Marais par le métro avec 450 €, sans logement ni travail.',
      '• La carte « Premiers pas » (en haut à gauche) te guide pas à pas. Le bouton 👀 Montrer t’indique où aller.',
      '• Ordre conseillé : 1) louer un logement libre (épingle 🔑), 2) prendre un petit-déjeuner, 3) postuler là où il y a une mallette verte, 4) aller à ton premier service, 5) faire des courses, 6) cuisiner chez toi, 7) parler à un voisin, 8) dormir chez toi.',
      '• Chaque étape rapporte un peu d’argent et d’XP. Ensuite : 3 objectifs du jour chaque matin, et tes rêves à long terme dans « Ma vie » (💼 en bas à gauche).',
    ].join('\n')],
    ['📱', 'L’écran', [
      '• En haut à gauche : l’heure, le jour, la saison et l’année, la météo, ton argent et tes jauges (⚡ énergie, 🍔 faim, 😊 moral). Une jauge qui clignote en rouge est presque vide.',
      '• En bas à gauche : 🥫 repas au frigo, 💼 ton travail (et « Ma vie »), 🏠 ton logement, 🚪 sortir (à l’intérieur), 🎯 te suivre.',
      '• À droite : 🗺️ plan de tous les lieux, 👥 les habitants, 🔁 routine automatique, 👕 ta tenue.',
      '• En haut à droite : pause, vitesse normale, accéléré, ⚙️ paramètres et ce guide, plein écran.',
      '• En bas à droite : la fiche du lieu ou de la personne, et les annonces. La croix ✕ les ferme.',
    ].join('\n')],
    ['👆', 'Toucher et caméra', [
      '• Toucher le sol = y aller : des pointillés dorés montrent le trajet jusqu’au repère.',
      '• Toucher un lieu = ton personnage y va et entre. S’il est fermé (ou si c’est le logement de quelqu’un), il va jusqu’à la porte et la fiche s’ouvre.',
      '• Toucher un habitant ouvre sa fiche (parler, saluer, cadeau…). Toucher un banc, une fontaine, une poubelle, l’étang ou un stand : ton personnage s’en sert.',
      '• Un doigt : tourner la vue (gauche-droite, haut-bas). Deux doigts : pincer pour zoomer, glisser pour te déplacer.',
      '• Quand tu déplaces la vue, la caméra arrête de te suivre : 🎯 pour la ramener sur toi.',
      '• À l’intérieur : touche directement un meuble (lit, canapé, comptoir, frigo…). Toucher un endroit vide rouvre la fiche du lieu.',
    ].join('\n')],
    ['🚶', 'Se déplacer', [
      '• À pied, on prend son temps : traverser tout le quartier prend environ une heure de jeu.',
      '• Au Garage Roue Libre : trottinette, vélo (2× plus rapide, sur les pistes cyclables vertes), scooter et voiture (les plus rapides, sur la chaussée ; tu finis à pied jusqu’à la porte). Le scooter et la voiture ont une assurance chaque lundi.',
      '• On traverse aux passages piétons, quand les voitures ont le feu rouge. Traverser ailleurs devant un policier : 35 € d’amende.',
    ].join('\n')],
    ['⚡', 'Tes besoins', [
      '• Énergie ⚡ : dors chez toi (le soir), fais une sieste, ou bois un café pour tenir.',
      '• Faim 🍔 : cuisine chez toi avec les repas du frigo 🥫 (courses à la supérette), ou mange au café et à la boulangerie.',
      '• Moral 😊 : discuter, télé, livre, banc, fêtes, repas au café, sport, et un logement confortable. Il baisse avec le travail, les dettes, la faim et le manque de logement.',
      '• Le jeu refuse ce qui n’a pas de sens (manger sans faim, sieste en pleine forme…) et te dit pourquoi.',
    ].join('\n')],
    ['🏠', 'Ton logement', [
      '• Compare les logements libres (🔑) : la première semaine se paie tout de suite, puis le loyer chaque lundi. 4 jours de retard : relance ; 8 jours : expulsion (tu peux dormir au métro).',
      '• Tu peux aussi acheter : plus de loyer, seulement une petite taxe foncière.',
      '• Le Marais (au nord) : appartements près du travail et des commerces. Les Jardins (au sud) : maisons avec jardin, plus chères et plus calmes, près du parc.',
      '• Meubler : dans la fiche de ton logement, 🛋️ « Catalogue de meubles ». Le confort fait remonter ton moral quand tu es chez toi. La console, le piano et l’aquarium ajoutent des activités, le grand lit fait mieux dormir. Tes meubles te suivent si tu déménages.',
    ].join('\n')],
    ['💼', 'Travail et carrière', [
      '• Postule là où il y a une mallette verte, quand quelqu’un est là pour te recevoir. Ton premier service est au plus tôt le lendemain (ou « Commencer lundi prochain »).',
      '• Sois à l’heure : retards et absences = avertissements, au 3e c’est le renvoi. 15 jours sans faute = augmentation.',
      '• Chaque lieu a plusieurs postes : certains demandent un diplôme 🎓 (cours du soir à l’école, 3 cours = 1 niveau), une formation 📜 (3 h à l’école : barista, CAP, secourisme, comptabilité, coach sportif…) ou de l’expérience ⏳ (jours travaillés dans le métier).',
      '• Dans la fiche de ton travail : « Demander une promotion » quand un poste plus élevé est libre.',
      '• Les commerces vivent de leurs clients : ceux qui marchent recrutent et augmentent leur équipe (📈 sur leur fiche), ceux qui perdent de l’argent licencient le dernier arrivé (📉). Choisis bien où postuler !',
    ].join('\n')],
    ['💶', 'L’argent et la banque', [
      '• Ton salaire est versé net : l’impôt est prélevé à la source.',
      '• Banque Pavé d’Or : dépose ton argent (à l’abri des pickpockets, +0,5 % par semaine), retire-le, ou emprunte 500 € si tu as un emploi (remboursement automatique le lundi).',
      '• Sans emploi et presque sans argent ? Demande l’aide sociale à la mairie.',
      '• Les loyers et les prix suivent le marché : plein emploi et logements rares = ça augmente.',
    ].join('\n')],
    ['🤝', 'Les habitants', [
      '• Chacun a son métier, son âge, ses amis et sa routine. Ils ne t’abordent jamais : c’est toi qui vas vers eux.',
      '• Parle-leur, plaisante, offre un cadeau, un café ou une balade : les liens se renforcent peu à peu (❤). Des amis peuvent te recommander pour un poste.',
      '• Anniversaires : le journal te prévient pour tes amis (« Souhaiter bon anniversaire » sur leur fiche). Le jour du tien, fête-le avec eux !',
    ].join('\n')],
    ['🏋️', 'Sport et loisirs', [
      '• Salle de sport Énergie (au bord du square) : séance de sport ou yoga. Ta forme 💪 monte et tu te fatigues jusqu’à 25 % moins vite ; sans sport, elle redescend doucement.',
      '• Parc des Glycines (Jardins) : nourrir les canards, balançoire, bancs. Place du Marché et place des Vosges : fontaines, bancs, pigeons.',
      '• Fêtes : marché le dimanche matin, brocante un samedi sur deux, concert le vendredi soir aux beaux jours, fête de la musique en été.',
    ].join('\n')],
    ['🗓️', 'Le temps qui passe', [
      '• 1 minute de jeu par seconde : une journée dure environ 24 minutes.',
      '• Une saison = 14 jours, une année = 4 saisons (56 jours). L’hiver, il neige et le froid fatigue ; sous la pluie, les habitants se réfugient au café.',
      '• Chacun vieillit : à 65 ans, les habitants prennent leur retraite. Au Nouvel An : le bilan de ton année et un feu d’artifice à minuit.',
    ].join('\n')],
    ['🏛️', 'La ville et le maire', [
      '• Le maire est élu tous les 14 jours : vote à la mairie les 3 derniers jours, et tu peux te présenter.',
      '• Les impôts paient les services publics : police, hôpital, pompiers, école, prison, tribunal, éboueurs. Le bilan est affiché à la mairie.',
      '• Les éboueurs nettoient les rues ; tu peux ramasser les déchets toi aussi.',
    ].join('\n')],
    ['⚖️', 'Délits et justice', [
      '• Voler ou cambrioler rapporte… mais témoins et police veillent.',
      '• Arrêté·e : garde à vue, puis procès le lendemain à 10h devant un jury de 3 habitants. Un avocat (120 €) aide beaucoup. Coupable : prison et amende.',
      '• En prison : repas, repos, atelier payé et cours. Tu peux aussi être tiré·e au sort comme juré·e.',
    ].join('\n')],
    ['🔁', 'La routine automatique', [
      '• Le bouton 🔁 laisse ton personnage vivre seul : manger, dormir, travailler…',
      '• Attention : livré à lui-même, il peut mal tourner (vols, pots-de-vin, jours d’absence). À utiliser avec prudence.',
    ].join('\n')],
    ['⚙️', 'Paramètres et sauvegarde', [
      '• Langue, taille du texte, sons (volume général, musique, ambiances, interface), sensibilité de la caméra, vibrations, astuces.',
      '• Qualité graphique (onglet Batterie) : Auto s’adapte à ton appareil, Haute est plus belle et plus fluide (le téléphone chauffe davantage), Basse est la plus légère. Économie de batterie : encore moins de détails.',
      '• La partie se sauvegarde toute seule (toutes les 10 s, chaque jour et en quittant), sur cet appareil.',
    ].join('\n')],
    ['❓', 'Questions fréquentes', [
      '• « Je ne peux pas entrer » : le lieu est fermé (personne en service). La fiche indique l’heure d’ouverture.',
      '• « On refuse ma candidature » : il manque un diplôme, une formation ou de l’expérience (en rouge sur la fiche), ou personne n’est là pour te recevoir. Réessaie un autre jour : le moral et les amis aident.',
      '• « Je suis toujours fatigué·e » : dors chez toi la nuit, mange, et fais du sport. Un grand lit aide.',
      '• « Je n’ai plus d’argent » : travaille, emprunte à la banque si tu as un emploi, ou demande l’aide à la mairie.',
      '• « Le jeu rame ou le téléphone chauffe » : ⚙️ → Batterie → Qualité graphique « Basse » ou « Économie de batterie ».',
      '• « Je ne retrouve pas mon personnage » : touche 🎯 en bas à gauche.',
    ].join('\n')],
  ],
  en: [
    ['🎯', 'Getting started', [
      'You arrive in the Marais by metro with €450, no home and no job.',
      '• The “First steps” card (top left) guides you step by step. The 👀 Show me button points the way.',
      '• Suggested order: 1) rent a free home (🔑 pin), 2) have breakfast, 3) apply where there is a green briefcase, 4) go to your first shift, 5) buy groceries, 6) cook at home, 7) chat with a neighbour, 8) sleep at home.',
      '• Each step pays a little money and XP. Then: 3 daily goals every morning, and long-term dreams in “My life” (💼 bottom left).',
    ].join('\n')],
    ['📱', 'The screen', [
      '• Top left: time, day, season and year, weather, your money and gauges (⚡ energy, 🍔 hunger, 😊 mood). A gauge blinking red is almost empty.',
      '• Bottom left: 🥫 fridge meals, 💼 your job (and “My life”), 🏠 your home, 🚪 exit (indoors), 🎯 follow me.',
      '• Right: 🗺️ map of all places, 👥 residents, 🔁 automatic routine, 👕 your outfit.',
      '• Top right: pause, normal speed, fast, ⚙️ settings and this guide, full screen.',
      '• Bottom right: the card of the place or person, and announcements. The ✕ closes them.',
    ].join('\n')],
    ['👆', 'Touch and camera', [
      '• Tap the ground = go there: golden dots show the route to the marker.',
      '• Tap a place = your character walks there and goes in. If it is closed (or someone else’s home), they walk to the door and its card opens.',
      '• Tap a resident to open their card (talk, wave, gift…). Tap a bench, fountain, bin, the pond or a stall: your character uses it.',
      '• One finger: rotate the view (left-right, up-down). Two fingers: pinch to zoom, slide to move.',
      '• When you move the view, the camera stops following you: 🎯 brings it back.',
      '• Indoors: tap furniture directly (bed, sofa, counter, fridge…). Tapping an empty spot reopens the place card.',
    ].join('\n')],
    ['🚶', 'Getting around', [
      '• Walking takes time: crossing the whole neighbourhood takes about an hour of game time.',
      '• At the Roue Libre garage: scooter, bike (2× faster, on the green cycle lanes), moped and car (fastest, on the road; you walk the last bit to the door). The moped and car have insurance every Monday.',
      '• Cross at pedestrian crossings when cars have a red light. Crossing elsewhere in front of an officer: €35 fine.',
    ].join('\n')],
    ['⚡', 'Your needs', [
      '• Energy ⚡: sleep at home (in the evening), take a nap, or have a coffee to keep going.',
      '• Hunger 🍔: cook at home with fridge meals 🥫 (groceries at the shop), or eat at the café and bakery.',
      '• Mood 😊: chatting, TV, books, benches, festivals, café meals, sport and a comfortable home. It drops with work, debt, hunger and having no home.',
      '• The game refuses things that make no sense (eating when not hungry, napping when full of energy…) and tells you why.',
    ].join('\n')],
    ['🏠', 'Your home', [
      '• Compare free homes (🔑): the first week is paid at once, then rent every Monday. 4 days late: reminder; 8 days: eviction (you can sleep in the metro).',
      '• You can also buy: no more rent, just a small property tax.',
      '• The Marais (north): flats close to work and shops. Les Jardins (south): houses with gardens, pricier and quieter, near the park.',
      '• Furnish: on your home card, 🛋️ “Furniture catalogue”. Comfort raises your mood when you are home. The console, piano and aquarium add activities, the big bed improves sleep. Your furniture follows you when you move.',
    ].join('\n')],
    ['💼', 'Work and career', [
      '• Apply where there is a green briefcase, when someone is there to see you. Your first shift is tomorrow at the earliest (or “Start next Monday”).',
      '• Be on time: lateness and absences = warnings, the 3rd means you are fired. 15 days without fault = a raise.',
      '• Each place has several positions: some need a diploma 🎓 (evening classes at the school, 3 classes = 1 level), a course 📜 (3 h at the school: barista, baking, first aid, accounting, fitness coach…) or experience ⏳ (days worked in the trade).',
      '• On your workplace card: “Ask for a promotion” when a higher position is free.',
      '• Shops live off their customers: busy ones hire and give raises (📈 on their card), losing ones lay off the last hired (📉). Choose where you apply!',
    ].join('\n')],
    ['💶', 'Money and the bank', [
      '• Your wage is paid net: income tax is withheld.',
      '• Pavé d’Or bank: deposit your money (safe from pickpockets, +0.5% per week), withdraw it, or borrow €500 if you have a job (automatic repayment on Mondays).',
      '• No job and almost no money? Ask for welfare at city hall.',
      '• Rents and prices follow the market: full employment and scarce homes = they go up.',
    ].join('\n')],
    ['🤝', 'Residents', [
      '• Everyone has a job, an age, friends and a routine. They never approach you: you go to them.',
      '• Talk, joke, give a gift, a coffee or a walk: bonds grow little by little (❤). Friends can recommend you for a job.',
      '• Birthdays: the newspaper tells you about your friends’ (“Wish happy birthday” on their card). On yours, celebrate with them!',
    ].join('\n')],
    ['🏋️', 'Sport and leisure', [
      '• Énergie gym (by the square): workout or yoga. Your fitness 💪 rises and you tire up to 25% more slowly; without sport it slowly drops.',
      '• Wisteria Park (Les Jardins): feed the ducks, swing, benches. Market square and Place des Vosges: fountains, benches, pigeons.',
      '• Festivals: market on Sunday mornings, flea market every other Saturday, Friday evening concerts in fine weather, music festival in summer.',
    ].join('\n')],
    ['🗓️', 'Time passing', [
      '• 1 game minute per second: a day lasts about 24 minutes.',
      '• A season = 14 days, a year = 4 seasons (56 days). In winter it snows and the cold is tiring; in the rain, residents take shelter in cafés.',
      '• Everyone ages: at 65, residents retire. On New Year: your year in review and fireworks at midnight.',
    ].join('\n')],
    ['🏛️', 'The city and the mayor', [
      '• The mayor is elected every 14 days: vote at city hall during the last 3 days, and you can run.',
      '• Taxes pay for public services: police, hospital, firefighters, school, prison, court, bin collectors. The budget is shown at city hall.',
      '• Bin collectors clean the streets; you can pick up litter too.',
    ].join('\n')],
    ['⚖️', 'Crime and justice', [
      '• Stealing or burglary pays… but witnesses and police are watching.',
      '• Arrested: police custody, then trial the next day at 10:00 before a jury of 3 residents. A lawyer (€120) helps a lot. Guilty: prison and a fine.',
      '• In prison: meals, rest, a paid workshop and classes. You may also be drawn as a juror.',
    ].join('\n')],
    ['🔁', 'Automatic routine', [
      '• The 🔁 button lets your character live on their own: eat, sleep, work…',
      '• Careful: left alone, they may go astray (theft, bribes, missed days). Use it with care.',
    ].join('\n')],
    ['⚙️', 'Settings and saving', [
      '• Language, text size, sound (main volume, music, ambience, interface), camera sensitivity, vibrations, tips.',
      '• Graphics quality (Battery tab): Auto adapts to your device, High looks better and smoother (the phone heats up more), Low is the lightest. Battery saver: even fewer details.',
      '• The game saves itself (every 10 s, every day and when you leave), on this device.',
    ].join('\n')],
    ['❓', 'FAQ', [
      '• “I can’t go in”: the place is closed (nobody on duty). The card shows when it opens.',
      '• “My application is refused”: a diploma, course or experience is missing (in red on the card), or nobody is there to see you. Try another day: mood and friends help.',
      '• “I’m always tired”: sleep at home at night, eat, and do some sport. A big bed helps.',
      '• “I have no money left”: work, borrow from the bank if you have a job, or ask for welfare at city hall.',
      '• “The game lags or the phone heats up”: ⚙️ → Battery → Graphics quality “Low” or “Battery saver”.',
      '• “I can’t find my character”: tap 🎯 at the bottom left.',
    ].join('\n')],
  ],
};
