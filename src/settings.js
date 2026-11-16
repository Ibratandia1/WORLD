// Paramètres du joueur, gardés sur l'appareil (localStorage « world.settings »).
// Ce ne sont pas des données de jeu : ils ne vont pas dans la sauvegarde de la partie.

const KEY = 'world.settings';

export const DEFAULTS = {
  lang: 'fr',          // langue de l'interface : 'fr' | 'en'
  volume: 0.9,         // volume général (0 à 1)
  sound: true,         // son général
  music: true,         // musique des fêtes
  ambience: true,      // ambiances (ville, pluie, oiseaux, café…)
  uiSounds: true,      // petits sons de l'interface (clic, événement, pièces…)
  vibrate: true,       // vibrations sur téléphone
  tips: true,          // astuces
  eventTimer: 12,      // secondes avant qu'un événement s'efface (0 = jamais)
  textSize: 'normal',  // 'small' | 'normal' | 'large'
  saver: false,        // économie de batterie (moins de détails, résolution réduite au prochain lancement)
  welcomed: false,     // cartes de bienvenue déjà vues sur cet appareil
};

let cur = null;
const listeners = [];

export function settings() {
  if (!cur) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* stockage indisponible */ }
    cur = { ...DEFAULTS, ...saved }; // le jeu est en français par défaut ; l'anglais se choisit dans ⚙️
  }
  return cur;
}

export function setSetting(k, v) {
  settings()[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* rien */ }
  listeners.forEach(f => f(k, v));
}

export function onSettings(f) { listeners.push(f); }
