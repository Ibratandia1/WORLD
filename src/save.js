import { takeSnapshot, applySnapshot } from './sim/snapshot.js';

const KEY = 'world.save';
const EVERY_MS = 10000;
let disabled = false;

function write(world, directors) {
  if (disabled) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(takeSnapshot(world, directors)));
    return true;
  } catch { return false; } // stockage plein ou bloqué : le jeu continue sans sauvegarde
}

// Charge la dernière partie si elle existe. Renvoie true si une partie a été reprise.
export function loadGame(world, directors) {
  try {
    const snap = JSON.parse(localStorage.getItem(KEY));
    return applySnapshot(world, directors, snap);
  } catch { return false; }
}

// Sauvegarde toutes les 10 s, à chaque nouveau jour, et quand on quitte ou met l'appli en arrière-plan.
export function startAutosave(world, directors, onSaved = () => {}) {
  const save = () => { if (write(world, directors)) onSaved(); };
  setInterval(save, EVERY_MS);
  world.on('newDay', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
}

// Efface la partie (le personnage, lui, est gardé) et recharge.
export function newGame() {
  disabled = true;
  try { localStorage.removeItem(KEY); } catch { /* rien à effacer */ }
  location.reload();
}
