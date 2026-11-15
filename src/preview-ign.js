// Aperçu : le vrai Marais (BD TOPO® de l'IGN) dessiné avec le moteur de rendu du jeu.
// Données préparées par tools/ign-fetch.mjs puis tools/ign-to-grid.mjs (data/ign/grid.json).
import { TW, TH, toScreen } from './iso.js';
import { TYPES } from './map/types.js';
import { drawBuildingTile, drawTree, rng } from './city/render.js';
import { attachControls } from './camera.js';

const HW = TW / 2, HH = TH / 2;
const GROUND = { '.': 0xefe3cc, '=': 0x9aa0b4, ':': 0xd8ccb4, g: 0x8fd36f, T: 0x8fd36f, w: 0x74bdf0, B: 0xd9cdb6 };

// Apparence d'un bâtiment selon son usage réel et sa hauteur
function lookOf(b) {
  const u = (b.usage || '') + ' ' + (b.usage2 || '');
  if (/Religieux/.test(u)) return 'cityhall';
  if (/Industriel/.test(u)) return 'garage';
  if (/Commercial/.test(b.usage || '')) return b.h > 18 ? 'office' : ['shop', 'cafe', 'bakery', 'fashion'][b.id % 4];
  if (/Commercial/.test(b.usage2 || '')) return ['cafe', 'shop', 'bakery', 'fashion'][b.id % 4]; // logements au-dessus d'une boutique
  return 'home';
}

class Preview extends Phaser.Scene {
  constructor() { super('preview'); }
  preload() { this.load.json('grid', 'data/ign/grid.json'); }

  create() {
    const G = this.cache.json.get('grid');
    const { w, h, rows, owner, buildings } = G;
    const at = (x, y) => (owner[y] && owner[y][x] != null ? owner[y][x] : -1);

    // Sol
    const ground = this.add.graphics();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x], s = toScreen(x, y);
      const col = GROUND[c] ?? GROUND['.'];
      ground.fillStyle((x + y) % 2 ? col : Phaser.Display.Color.ValueToColor(col).darken(3).color);
      ground.fillPoints([{ x: s.x, y: s.y - HH }, { x: s.x + HW, y: s.y }, { x: s.x, y: s.y + HH }, { x: s.x - HW, y: s.y }], true);
      // bordure de trottoir
      if (c === '.' || c === ':') for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        if (!rows[y + dy] || rows[y + dy][x + dx] !== '=') continue;
        const a = dy ? toScreen(x - 0.5, y + dy / 2) : toScreen(x + dx / 2, y - 0.5);
        const b = dy ? toScreen(x + 0.5, y + dy / 2) : toScreen(x + dx / 2, y + 0.5);
        ground.lineStyle(3, 0xd4d7df, 1); ground.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // Bâtiments et arbres, dessinés de l'arrière vers l'avant (une couche par diagonale)
    const layers = [];
    const dummy = this.make.graphics({ add: false });
    for (let k = 0; k <= w + h; k++) {
      const g = this.add.graphics();
      for (let x = Math.max(0, k - h + 1); x <= Math.min(w - 1, k); x++) {
        const y = k - x;
        const id = at(x, y);
        const s = toScreen(x, y);
        if (rows[y][x] === 'T') drawTree(g, s.x, s.y, (x * 7 + y) % 5 === 0);
        if (id < 0) continue;
        const b = buildings[id];
        const type = lookOf(b);
        const T = TYPES[type];
        const height = Math.max(18, Math.min(110, b.h * 3.2));
        const info = {
          type, expL: at(x, y + 1) !== id, expR: at(x + 1, y) !== id, expBL: at(x - 1, y) !== id, expBR: at(x, y - 1) !== id,
          r: rng((x + 1) * 7919 + (y + 1) * 104729), door: false,
        };
        drawBuildingTile(g, dummy, s.x, s.y, height, T, info);
      }
      layers.push(g);
    }

    // On fige le tout dans des textures (rendu fluide même avec des milliers de cases)
    const minX = toScreen(0, h).x - HW, maxX = toScreen(w, 0).x + HW;
    const minY = -220, maxY = toScreen(w, h).y + HH;
    const CW = 2048;
    for (let x0 = minX; x0 < maxX; x0 += CW) {
      for (let y0 = minY; y0 < maxY; y0 += CW) {
        const rt = this.add.renderTexture(x0, y0, Math.min(CW, maxX - x0), Math.min(CW, maxY - y0)).setOrigin(0, 0);
        rt.draw(ground, -x0, -y0);
        for (const g of layers) rt.draw(g, -x0, -y0);
      }
    }
    ground.destroy(); layers.forEach(g => g.destroy()); dummy.destroy();

    const n = buildings.filter(Boolean).length;
    document.getElementById('stats').textContent =
      `${n} bâtiments réels · ${w}×${h} cases de ${G.cell} m · environ ${Math.round(w * G.cell)} × ${Math.round(h * G.cell)} m`;

    // Caméra
    const cam = this.cameras.main;
    this.minZoom = 0.12; this.maxZoom = 3 * DPR;
    this.setZoom(Math.min(cam.width / (maxX - minX), cam.height / (maxY - minY)) * 1.05);
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    attachControls(this, () => {});
  }

  setZoom(z) { this.cameras.main.setZoom(Phaser.Math.Clamp(z, this.minZoom, this.maxZoom)); }
}

const DPR = Math.min(window.devicePixelRatio || 1, 3);
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', transparent: true,
  scale: { mode: Phaser.Scale.NONE, width: innerWidth * DPR, height: innerHeight * DPR, zoom: 1 / DPR },
  render: { antialias: true },
  scene: [Preview],
});
addEventListener('resize', () => game.scale.resize(innerWidth * DPR, innerHeight * DPR));
window.previewGame = game;
