import { CHAR_W, CHAR_H, drawCharacter } from './look.js';
import { hex } from './color.js';
import { openCustomizer } from './customize.js';
import { newGame } from './save.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { setSetting } from './settings.js';
import { SEASON_INFO } from './sim/world.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Tout premier écran d'une nouvelle partie : choisir sa langue (avant la création du personnage et l'introduction)
export function chooseLanguage(next) {
  const el = document.getElementById('welcome');
  el.innerHTML = `<div class="card lang-pick"><div class="wic">🌍</div><h2>Choisis ta langue<br><small>Choose your language</small></h2>
    <div class="btns"><button class="main" data-l="fr">🇫🇷 Français</button><button class="main" data-l="en">🇬🇧 English</button></div></div>`;
  el.classList.remove('hidden');
  el.onclick = e => {
    const b = e.target.closest('button[data-l]');
    if (!b) return;
    setSetting('lang', b.dataset.l);
    el.classList.add('hidden'); el.onclick = null;
    next();
  };
}

// Écran d'accueil quand une partie existe : continuer, changer de look, ou recommencer.
export function showStart() {
  const w = state.world, p = state.player;
  w.paused = true;
  const el = document.getElementById('start');
  el.innerHTML = `
    <div class="card">
      <canvas width="${CHAR_W * 6}" height="${CHAR_H * 6}"></canvas>
      <div>
        <h1>World</h1>
        <p class="sub">${t('Le Marais, Paris')}</p>
        <p class="who"><b>${esc(p.name)}</b> · ${t('Jour')} ${w.day} · ${w.dayShort} ${w.clock}</p>
        <div class="stchips">
          <span>💶 ${Math.round(p.money)} €</span>
          <span>${p.home != null ? '🏠 ' + esc(t('Chez toi')) : '🔑 ' + esc(t('Sans logement'))}</span>
          <span>${p.job ? '💼 ' + esc(t('Ton travail')) : '📝 ' + esc(t('Sans emploi'))}</span>
          <span>🗓️ ${esc(t((SEASON_INFO[w.season] || {}).label || ''))}</span>
        </div>
        <div class="btns">
          <button class="main" data-go>▶ ${t('Continuer')}</button>
          <button data-look>👕 ${t('Modifier mon personnage')}</button>
          <button data-settings>⚙️ ${t('Paramètres')}</button>
          <button class="danger" data-new>🔄 ${t('Nouvelle partie')}</button>
        </div>
      </div>
    </div>`;
  const ctx = el.querySelector('canvas').getContext('2d');
  drawCharacter(p.look, (x, y, ww, hh, c) => { ctx.fillStyle = hex(c); ctx.fillRect(x * 6, y * 6, ww * 6, hh * 6); });
  el.classList.remove('hidden');

  const close = () => { el.classList.add('hidden'); el.onclick = null; };
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-go')) { close(); w.paused = false; state.ui.syncControls(); }
    if (b.hasAttribute('data-settings')) { state.ui.openSettings('general'); return; }
    else if (b.hasAttribute('data-look')) { close(); w.paused = false; openCustomizer(); }
    else if (b.hasAttribute('data-new')) {
      if (confirm(t('Recommencer une nouvelle partie ? Ton argent et ta progression seront effacés.'))) newGame();
    }
  };
}
