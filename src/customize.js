import { LOOK_OPTIONS, CHAR_W, CHAR_H, drawCharacter, randomLook, saveProfile } from './look.js';
import { hex } from './color.js';
import { state } from './state.js';
import { newGame } from './save.js';
import { CATALOG } from './sim/catalog.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SCALE = 8;

const ROWS = [
  ['skin', 'Peau', 'color'],
  ['hairColor', 'Cheveux', 'color'],
  ['hairStyle', 'Coiffure', 'choice'],
  ['build', 'Silhouette', 'choice'],
  ['body', 'Haut', 'color'],
  ['legs', 'Bas', 'color'],
  ['accessory', 'Accessoire', 'choice'],
  ['outfit', 'Tenue', 'choice'],
  ['hat', 'Chapeau', 'choice'],
];

// Options de base + ce que le joueur a acheté en boutique
function optionsFor(key, p) {
  const base = LOOK_OPTIONS[key];
  const bought = CATALOG.filter(i => i.look && i.look[key] && p.owned.includes(i.id)).map(i => [i.look[key], `${i.icon} ${i.name}`]);
  return [...base, ...bought];
}

// Fenêtre de création / personnalisation du personnage.
export function openCustomizer({ first = false } = {}) {
  const p = state.player, w = state.world;
  const wasPaused = w.paused;
  w.paused = true;
  let look = { outfit: 'normal', hat: 'aucun', ...p.look };

  const el = document.getElementById('custom');
  const rows = ROWS.map(([key, label, kind]) => {
    const list = kind === 'color' ? LOOK_OPTIONS[key] : optionsFor(key, p);
    if (kind !== 'color' && list.length < 2 && key !== 'accessory') {
      return `<div class="row"><span>${label}</span><div class="opts"><small class="hint">🛍️ À acheter à la Maison Plume</small></div></div>`;
    }
    const opts = list.map(o => kind === 'color'
      ? `<button class="sw" data-k="${key}" data-v="${o}" style="background:${hex(o)}"></button>`
      : `<button class="chip" data-k="${key}" data-v="${o[0]}">${esc(o[1])}</button>`).join('');
    return `<div class="row"><span>${label}</span><div class="opts">${opts}</div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="card">
      <div class="preview">
        <canvas width="${CHAR_W * SCALE}" height="${CHAR_H * SCALE}"></canvas>
        <button class="dice" data-random title="Au hasard">🎲</button>
      </div>
      <div class="form">
        <h2>${first ? 'Crée ton personnage' : 'Ton style'}</h2>
        <div class="row"><span>Prénom</span>
          <input id="c-name" maxlength="14" placeholder="Ton prénom" value="${p.name === 'Toi' ? '' : esc(p.name)}"></div>
        ${rows}
        <button class="go" data-go>${first ? 'C’est parti !' : 'Valider'}</button>
        ${first ? '' : '<button class="reset" data-reset>🔄 Nouvelle partie</button>'}
      </div>
    </div>`;
  el.classList.remove('hidden');

  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const refresh = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCharacter(look, (x, y, ww, hh, c) => { ctx.fillStyle = hex(c); ctx.fillRect(x * SCALE, y * SCALE, ww * SCALE, hh * SCALE); });
    el.querySelectorAll('[data-k]').forEach(b => {
      b.classList.toggle('on', String(look[b.dataset.k]) === b.dataset.v);
    });
  };
  refresh();

  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) {
      const isColor = ROWS.find(r => r[0] === b.dataset.k)[2] === 'color';
      look[b.dataset.k] = isColor ? Number(b.dataset.v) : b.dataset.v;
      refresh();
    } else if (b.hasAttribute('data-random')) {
      look = { ...randomLook(), outfit: look.outfit, hat: look.hat }; // on garde ce qui a été acheté
      refresh();
    } else if (b.hasAttribute('data-reset')) {
      if (confirm('Recommencer une nouvelle partie ? Ton argent et ta progression seront effacés (ton personnage est gardé).')) newGame();
    } else if (b.hasAttribute('data-go')) {
      const name = el.querySelector('#c-name').value.trim() || 'Toi';
      p.name = name;
      p.look = look;
      p.texKey = `char_${p.id}_${Date.now()}`; // nouvelle texture, les scènes la recréent
      saveProfile({ name, look });
      el.classList.add('hidden');
      el.onclick = null;
      w.paused = first ? false : wasPaused;
      if (state.ui) state.ui.syncControls();
      if (first && state.ui) state.ui.showWelcome(); // nouvelle partie : quelques cartes pour bien démarrer
    }
  };
}
