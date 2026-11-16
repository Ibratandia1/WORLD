import { CHAR_W, CHAR_H, drawCharacter } from './look.js';
import { hex } from './color.js';
import { openCustomizer } from './customize.js';
import { newGame } from './save.js';
import { state } from './state.js';
import { t } from './i18n.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
        <p>${esc(p.name)} · ${w.dayShort} ${w.clock} · ${Math.round(p.money)} €</p>
        <div class="btns">
          <button class="main" data-go>▶ ${t('Continuer')}</button>
          <button data-look>👕 ${t('Modifier mon personnage')}</button>
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
    else if (b.hasAttribute('data-look')) { close(); w.paused = false; openCustomizer(); }
    else if (b.hasAttribute('data-new')) {
      if (confirm(t('Recommencer une nouvelle partie ? Ton argent et ta progression seront effacés.'))) newGame();
    }
  };
}
