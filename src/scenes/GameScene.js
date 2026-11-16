import { TW, TH, toScreen, toTile } from '../iso.js';
import { TYPES } from '../map/types.js';
import { ACTIONS } from '../sim/actions.js';
import { state } from '../state.js';
import { ensureCharTexture, randomLook } from '../look.js';
import { attachControls } from '../camera.js';
import { findPath } from '../sim/pathfinding.js';
import { freeUnits, isClosed } from '../sim/city.js';
import { shade } from '../color.js';
import { FestDecor } from '../city/festdecor.js';
import { settings } from '../settings.js';
import { festById } from '../sim/festivals.js';
import { drawTree, drawBuildingTile, drawShadow, drawGroundDetails, drawStreetDecor, makeCarTextures, Traffic, Crowd, rng, makeBirdTextures, Birds, twin, NIGHT, NIGHT_MAX } from '../city/render.js';

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const GROUND = {
  pave: [0xefe3cc, 0xe6d8bd],
  road: [0x9aa0b4, 0x9399ad],
  cobble: [0xd8ccb4, 0xd2c5ab],
  grass: [0x8fd36f, 0x84c965],
  water: [0x74bdf0, 0x6cb4e8],
};
const HW = TW / 2, HH = TH / 2;
const depthAt = (x, y) => 10 + (x + y) * 10;

// Façades : des teintes douces mais bien différentes, pour reconnaître chaque immeuble d'un coup d'œil
const FACADES = [0xf1e4c8, 0xf3d9a4, 0xeec3b8, 0xc9dcc0, 0xc7d8e8, 0xe2b48f, 0xd9cdea, 0xf5cfa8, 0xe8e2d4, 0xd6c3a5, 0xbfd8d2, 0xf0d5c0];
const ROOFS = [0x8796b0, 0x5f6c86, 0xb5654a, 0x6fa48f, 0x7a88a2, 0x9c5a4a];
// Teinte du métier pour les commerces (en plus de l'auvent)
const SHOP_TINT = { cafe: 0xe8c4a0, bakery: 0xf4dc9a, shop: 0xcfe8d2, fashion: 0xf2c6d8 };

// Rendu isométrique de la carte + contrôles tactiles (glisser, pincer, toucher).
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }


  create() {
    this.world = state.world;
    this.map = this.world.map;
    state.scene = this;
    this.hulls = [];
    this.bubbles = [];
    this.lights = [];   // fenêtres et lampadaires allumés la nuit
    this.darks = [];    // calques d'obscurité (opaques la nuit)

    this.makeTextures();
    makeCarTextures(this);
    this.drawIsland();
    this.drawGround();
    drawGroundDetails(this, this.map);
    // Obscurité du sol et du ciel (sous les flaques de lumière des lampadaires)
    this.darks.push(this.add.rectangle(0, 0, 40000, 40000, NIGHT).setDepth(0.55).setAlpha(0));
    this.drawBuildings();
    this.season = this.world.season;
    this.spots = drawStreetDecor(this, this.map, this.lights, this.darks, this.season);
    this.makeSnowLayer();
    this.world.on('season', s => this.setSeason(s));
    // Fêtes du quartier : décors créés au début, retirés à la fin
    this.fest = new FestDecor(this);
    this.world.on('festivalStart', e => this.fest.show(e.fest));
    this.world.on('festivalEnd', e => this.fest.hide(e.fest));
    if (this.world.festivals) for (const id of this.world.festivals.active) this.fest.show(festById(id));
    // Incendies : flammes et fumée sur le bâtiment tant que les pompiers ne sont pas passés
    this.fireFx = {};
    this.world.on('fire', e => this.showFire(e.building));
    this.world.on('fireOut', e => this.hideFire(e.building));
    if (this.world.safety) for (const id of Object.keys(this.world.safety.fires)) this.showFire(this.world.building(+id));
    this.traffic = new Traffic(this, this.map);
    this.crowd = new Crowd(this, this.map, randomLook, ensureCharTexture);
    this.applySaver(settings().saver);
    makeBirdTextures(this);
    this.birds = new Birds(this, this.map);

    this.views = new Map();
    this.markerBob = { o: 0 };
    this.tweens.add({ targets: this.markerBob, o: -5, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    for (const a of this.world.actors) this.addActorView(a);

    this.setupCamera();
    attachControls(this, p => this.tap(p));
    this.listen();
    this.syncHomeBubbles();
    this.scene.launch('interior');
    this.scene.launch('fx');
  }

  update(time, delta) {
    this.world.update(delta);
    if (!this.world.paused) { this.traffic.update(delta, this.world.hour); this.birds.update(delta, this.world.actors); }
    this.crowd.update(delta, this.world.hour, findPath, this.world.paused, this.world.weather);
    this.updateSnow(delta);
    if (!this.world.paused) this.fest.update(delta);
    if ((this.lightTick = (this.lightTick || 0) + delta) > 400) { this.lightTick = 0; this.syncLights(); }
    this.syncViews(time);
    if ((this.occTick = (this.occTick || 0) + delta) > 90) { this.occTick = 0; this.updateOcclusion(); }
    if ((this.bubTick = (this.bubTick || 0) + delta) > 250) { this.bubTick = 0; this.declutter(); this.cull(); }
    if ((this.homeTick = (this.homeTick || 0) + delta) > 1000) { this.homeTick = 0; this.syncHomeBubbles(); }
    this.clampCamera();
    this.syncInterior();
    state.ui.update(delta);
  }

  // Quand le joueur est dans un lieu, on affiche son intérieur à la place de la carte.
  syncInterior() {
    const inside = state.player.inside;
    const b = inside != null ? this.map.buildings[inside] : null;
    if (b === this.shownInterior || !state.interior) return;
    this.shownInterior = b;
    if (b) state.interior.show(b);
    else state.interior.hide();
    this.cameras.main.setVisible(!b);
    this.input.enabled = !b;
    document.body.classList.toggle('indoors', !!b);
    if (!b) this.centerOnPlayer();
  }

  // ---------- Textures générées (pas d'images externes pour l'instant) ----------
  makeTextures() {
    const g = this.make.graphics({ add: false });
    const diamond = [{ x: HW, y: 0 }, { x: TW, y: HH }, { x: HW, y: TH }, { x: 0, y: HH }];
    for (const [name, cols] of Object.entries(GROUND)) {
      cols.forEach((c, i) => {
        g.clear();
        g.fillStyle(c); g.fillPoints(diamond, true);
        g.lineStyle(1, c); g.strokePoints(diamond, true);
        // Texture : petits points dans le losange
        const speck = (n, cols, size = 1) => {
          for (let k = 0; k < n; k++) {
            const x = Math.random() * TW, y = Math.random() * TH;
            if (Math.abs(x - HW) / HW + Math.abs(y - HH) / HH > 0.88) continue;
            g.fillStyle(cols[k % cols.length], 0.55); g.fillRect(x, y, size, size);
          }
        };
        if (name === 'pave') {
          // pavés : joints dans les deux directions
          g.lineStyle(1, Phaser.Display.Color.ValueToColor(c).darken(9).color, 0.9);
          for (const t of [0.25, 0.5, 0.75]) {
            g.lineBetween(HW * t, HH + HH * t, HW + HW * t, HH * t);       // parallèle au bord haut-droit
            g.lineBetween(HW * t, HH - HH * t, HW + HW * t, TH - HH * t);  // parallèle au bord haut-gauche
          }
          speck(10, [0xffffff, 0xcfc2a8]);
        }
        if (name === 'road') speck(40, [0x7f8598, 0xb3b8c8, 0x8a90a3]); // le marquage dépend du sens de la rue : voir drawGroundDetails
        if (name === 'cobble') {
          // vieux pavés arrondis des ruelles et des places
          for (let k = 0; k < 26; k++) {
            const x = 6 + Math.random() * (TW - 12), y = 3 + Math.random() * (TH - 6);
            if (Math.abs(x - HW) / HW + Math.abs(y - HH) / HH > 0.8) continue;
            g.fillStyle(Phaser.Display.Color.ValueToColor(c).darken(12).color, 0.8); g.fillEllipse(x, y + 0.6, 6, 3.4);
            g.fillStyle(Phaser.Display.Color.ValueToColor(c).lighten(4).color, 1); g.fillEllipse(x, y, 5, 2.8);
          }
        }
        if (name === 'grass') {
          speck(26, [0x6fbf5a, 0xa8e08a, 0x5aa84a], 2);
          speck(4, [0xffffff, 0xf2c94c], 1);
        }
        if (name === 'water') { g.lineStyle(1, 0xffffff, 0.35); g.lineBetween(20 + i * 8, 14, 30 + i * 8, 14); }
        g.generateTexture(`g_${name}_${i}`, TW, TH);
      });
    }
    g.clear(); g.fillStyle(0xffd23f); g.fillTriangle(0, 0, 14, 0, 7, 10);
    g.lineStyle(2, 0x9b6b00); g.strokeTriangle(0, 0, 14, 0, 7, 10);
    g.generateTexture('marker', 14, 11);
    // Anneau au sol sous le joueur
    g.clear();
    g.fillStyle(0xffd23f, 0.28); g.fillEllipse(22, 11, 42, 20);
    g.lineStyle(3, 0xffd23f, 1); g.strokeEllipse(22, 11, 38, 17);
    g.lineStyle(1, 0xffffff, 0.9); g.strokeEllipse(22, 11, 30, 12);
    g.generateTexture('ring', 44, 22);
    g.clear(); g.fillStyle(0xdbe7ff); g.fillRect(0, 0, 2, 12);
    g.generateTexture('drop', 2, 12);

    // Véhicules vus de côté (sous le personnage)
    const wheel = (x, y, r) => { g.lineStyle(2, 0x222228, 1); g.strokeCircle(x, y, r); g.fillStyle(0x8f96a3); g.fillCircle(x, y, 1); };
    g.clear();
    wheel(6, 10, 5); wheel(22, 10, 5);
    g.lineStyle(2, 0x2f7d5b, 1);
    g.lineBetween(6, 10, 13, 4); g.lineBetween(13, 4, 22, 10); g.lineBetween(6, 10, 15, 10); g.lineBetween(15, 10, 13, 4);
    g.lineBetween(20, 2, 22, 10); g.fillStyle(0x222228); g.fillRect(11, 2, 5, 2); g.fillRect(18, 1, 5, 2);
    g.generateTexture('veh_velo', 28, 16);
    g.clear();
    wheel(5, 12, 3); wheel(20, 12, 3);
    g.fillStyle(0x5b8def); g.fillRect(4, 9, 17, 2);
    g.lineStyle(2, 0x34323d, 1); g.lineBetween(19, 10, 21, 0); g.fillStyle(0x34323d); g.fillRect(18, 0, 6, 2);
    g.generateTexture('veh_trottinette', 26, 16);
    g.clear();
    wheel(6, 13, 4); wheel(24, 13, 4);
    g.fillStyle(0xd8504d); g.fillRoundedRect(4, 4, 24, 8, 3); g.fillRect(22, 0, 4, 6);
    g.fillStyle(0x34323d); g.fillRoundedRect(6, 2, 10, 3, 1);
    g.fillStyle(0xfff3c4); g.fillCircle(28, 6, 1.5);
    g.generateTexture('veh_scooter', 32, 18);
    g.destroy();
    for (const k of ['veh_velo', 'veh_trottinette', 'veh_scooter']) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // ---------- Carte ----------
  drawIsland() {
    const { w, h } = this.map;
    const L = toScreen(0, h - 1); L.x -= HW;
    const B = toScreen(w - 1, h - 1); B.y += HH;
    const R = toScreen(w - 1, 0); R.x += HW;
    const d = 70, gb = 8;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x6ea84f); g.fillPoints([L, B, { x: B.x, y: B.y + gb }, { x: L.x, y: L.y + gb }], true);
    g.fillStyle(0x5c9442); g.fillPoints([B, R, { x: R.x, y: R.y + gb }, { x: B.x, y: B.y + gb }], true);
    g.fillStyle(0x8d5b3d); g.fillPoints([{ x: L.x, y: L.y + gb }, { x: B.x, y: B.y + gb }, { x: B.x, y: B.y + d }, { x: L.x, y: L.y + d }], true);
    g.fillStyle(0x734a32); g.fillPoints([{ x: B.x, y: B.y + gb }, { x: R.x, y: R.y + gb }, { x: R.x, y: R.y + d }, { x: B.x, y: B.y + d }], true);
    // petites pierres dans la terre
    g.fillStyle(0x5e3b27, 0.6);
    for (let i = 0; i < 70; i++) {
      const left = i % 2 === 0;
      const t = Math.random();
      const A = left ? L : B, Z = left ? B : R;
      const x = A.x + (Z.x - A.x) * t;
      const y = A.y + (Z.y - A.y) * t + gb + 6 + Math.random() * (d - gb - 12);
      g.fillRect(x, y, 3, 2);
    }
  }

  drawGround() {
    const { w, h, tiles } = this.map;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = toScreen(x, y);
        this.add.image(s.x, s.y, `g_${tiles[y][x].ground}_${(x + y) % 2}`).setDepth(0);
      }
    }
  }

  // Économie de batterie : moins de passants et de voitures
  applySaver(on) {
    if (this.crowd) this.crowd.max = on ? 5 : 14;
    if (this.traffic) this.traffic.max = on ? 7 : 18;
  }

  // ---------- Performances : on ne dessine que ce qui est à l'écran ----------
  // (immeubles, décor, lampadaires, morceaux de sol ; les Graphics de Phaser ne sont pas éliminés tout seuls)
  cull() {
    const v = this.cameras.main.worldView, m = 120;
    const x0 = v.x - m, y0 = v.y - m, x1 = v.right + m, y1 = v.bottom + m;
    const sig = `${Math.round(x0 / 40)},${Math.round(y0 / 40)},${Math.round(x1 / 40)},${Math.round(y1 / 40)}`;
    if (sig === this.cullSig) return; // la caméra n'a pas bougé
    this.cullSig = sig;
    for (const hl of this.hulls) {
      if (!hl.box) { const pts = hl.poly.points; hl.box = [Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y))]; }
      const on = hl.box[2] > x0 && hl.box[0] < x1 && hl.box[3] > y0 && hl.box[1] < y1;
      if (hl.g) { hl.g.setVisible(on); if (hl.d) hl.d.setVisible(on); if (hl.lg) hl.lg.setVisible(on); }
    }
    for (const c of this.cullables || []) {
      const b = c.box || [c.x - 70, c.y - 100, c.x + 70, c.y + 30];
      const on = b[2] > x0 && b[0] < x1 && b[3] > y0 && b[1] < y1;
      for (const o of c.objs) if (o && o.active !== false) o.setVisible(on);
    }
  }

  // ---------- Bulles des lieux : jamais l'une sur l'autre ----------
  // Priorité : chez toi / ton travail > services et commerces > logements libres. Une bulle qui en chevauche
  // une plus importante est masquée ; quand on dézoome beaucoup, seules les tiennes restent.
  declutter() {
    const cam = this.cameras.main, p = state.player, z = cam.zoom;
    const far = z < this.minZoom * 1.35;
    const prio = b => (b.id === p.home || (p.job && p.job.building === b.id) ? 3 : b.type === 'home' ? 1 : 2);
    const list = this.bubbles.filter(x => x.c.base !== false).sort((a, b) => prio(b.b) - prio(a.b) || a.c.y - b.c.y);
    const placed = [];
    const W = 34 * z, H = 30 * z;
    for (const x of this.bubbles) if (x.c.base === false) x.c.setVisible(false);
    for (const x of list) {
      const sx = x.c.x * z, sy = x.c.y * z;
      let show = !(far && prio(x.b) < 3);
      if (show) show = !placed.some(o => Math.abs(o.x - sx) < W && Math.abs(o.y - sy) < H);
      x.c.setVisible(show);
      if (show) placed.push({ x: sx, y: sy });
    }
  }

  // ---------- Incendies ----------
  showFire(b) {
    if (this.fireFx[b.id]) return;
    if (!this.textures.exists('flame')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffd23f); g.fillCircle(6, 6, 6); g.fillStyle(0xff7a29, 0.9); g.fillCircle(6, 7, 4); g.generateTexture('flame', 12, 12);
      g.clear(); g.fillStyle(0x5a5560, 0.7); g.fillCircle(10, 10, 10); g.generateTexture('smoke', 20, 20);
      g.destroy();
    }
    const tops = b.tiles.slice(0, 4).map(t => { const c = toScreen(t.x, t.y); return { x: c.x, y: c.y - b.height, d: depthAt(t.x, t.y) + 8 }; });
    const ems = [];
    for (const t of tops) {
      ems.push(this.add.particles(t.x, t.y, 'flame', {
        x: { min: -14, max: 14 }, y: { min: -4, max: 6 }, lifespan: 700, speedY: { min: -60, max: -30 }, scale: { start: 1.2, end: 0.2 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', frequency: 60, quantity: 2,
      }).setDepth(t.d));
      ems.push(this.add.particles(t.x, t.y - 10, 'smoke', {
        x: { min: -10, max: 10 }, lifespan: 2600, speedY: { min: -40, max: -20 }, speedX: { min: -8, max: 14 }, scale: { start: 0.6, end: 2.2 },
        alpha: { start: 0.55, end: 0 }, frequency: 180, quantity: 1,
      }).setDepth(t.d + 0.5));
    }
    this.fireFx[b.id] = ems;
  }

  hideFire(b) {
    const ems = this.fireFx[b.id];
    if (!ems) return;
    ems.forEach(e => { e.stop(); this.time.delayedCall(2800, () => e.destroy()); });
    delete this.fireFx[b.id];
  }

  // ---------- Façades transparentes ----------
  // Quand un immeuble passe devant ton personnage, ses cases deviennent transparentes (comme dans les Sims)
  updateOcclusion() {
    const p = state.player;
    const now = new Set();
    if (p.outdoors) {
      const s = toScreen(p.px, p.py);
      const pd = depthAt(p.px, p.py) + 5;
      const pts = [[s.x, s.y - 4], [s.x, s.y - 22], [s.x, s.y - 40], [s.x - 8, s.y - 22], [s.x + 8, s.y - 22]];
      for (const hl of this.hulls) {
        if (hl.depth <= pd || !hl.g) continue;
        if (pts.some(([x, y]) => Phaser.Geom.Polygon.Contains(hl.poly, x, y))) now.add(hl);
      }
    }
    for (const hl of this.faded || []) if (!now.has(hl)) this.fadeHull(hl, false);
    for (const hl of now) this.fadeHull(hl, true);
    this.faded = now;
  }

  fadeHull(hl, on) {
    const k = on ? 0.28 : 1;
    hl.g.setAlpha(k);
    if (hl.d) hl.d.setAlpha((this.night || 0) * NIGHT_MAX * k);
    if (hl.lg) hl.lg.setAlpha((this.night || 0) * k);
  }

  // ---------- Saisons ----------
  setSeason(s) {
    if (s === this.season) return;
    this.season = s;
    for (const t of this.spots.trees) { t.g.clear(); drawTree(t.g, t.x, t.y, t.blossom, s); }
  }

  // Neige au sol : elle s'accumule quand il neige et fond ensuite (plus vite au soleil)
  makeSnowLayer() {
    const { w, h, tiles } = this.map;
    const g = this.add.graphics().setDepth(0.45).setAlpha(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gr = tiles[y][x].ground;
      if (gr === 'water') continue;
      const s = toScreen(x, y);
      g.fillStyle(0xffffff, gr === 'road' ? 0.45 : 1); // la chaussée reste plus grise (déneigée)
      g.fillPoints([{ x: s.x, y: s.y - HH }, { x: s.x + HW, y: s.y }, { x: s.x, y: s.y + HH }, { x: s.x - HW, y: s.y }], true);
    }
    this.snow = g;
    this.snowCover = this.world.weather === 'snow' ? 0.5 : 0;
  }

  updateSnow(delta) {
    const w = this.world;
    if (w.paused) return;
    const gm = delta / 1000 * (w.fast ? 6 : w.speed); // ~minutes de jeu écoulées
    if (w.weather === 'snow') this.snowCover = Math.min(1, this.snowCover + gm / 90);
    else this.snowCover = Math.max(0, this.snowCover - gm / (w.weather === 'sun' ? 120 : 360));
    this.snow.setAlpha(this.snowCover * 0.6);
  }

  // Les fenêtres s'allument à la tombée de la nuit
  syncLights() {
    const h = this.world.hour;
    let night = 0;
    if (h >= 19 && h < 22) night = (h - 19) / 3;
    else if (h >= 22 || h < 5.5) night = 1;
    else if (h >= 5.5 && h < 7.5) night = 1 - (h - 5.5) / 2;
    for (const lg of this.lights) lg.setAlpha(night);
    for (const d of this.darks) d.setAlpha(night * NIGHT_MAX);
    this.night = night;
    for (const hl of this.faded || []) this.fadeHull(hl, true);
    // Teinte des personnages / voitures / oiseaux (sprites)
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(0x3a3f5c), 100, Math.round(night * 100));
    this.nightTint = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }

  drawBuildings() {
    const shadows = this.add.graphics().setDepth(0.5);
    const at = (x, y) => (this.map.tiles[y] && this.map.tiles[y][x] ? this.map.tiles[y][x].building : null);
    for (const b of this.map.buildings) {
      const T = this.lookFor(b);
      let sx = 0, sy = 0, top = Infinity;
      const door = b.tiles.filter(t => at(t.x, t.y + 1) !== b.id).sort((m, n) => (n.x + n.y) - (m.x + m.y))[0];
      for (const t of b.tiles) {
        const c = toScreen(t.x, t.y);
        const info = {
          type: b.type,
          expL: at(t.x, t.y + 1) !== b.id, expR: at(t.x + 1, t.y) !== b.id,
          expBL: at(t.x - 1, t.y) !== b.id, expBR: at(t.x, t.y - 1) !== b.id,
          r: rng((t.x + 1) * 7919 + (t.y + 1) * 104729), door: t === door,
        };
        if (info.expR) drawShadow(shadows, c.x, c.y, b.height);
        if (info.expL) { // fine ombre au sol devant la façade gauche
          shadows.fillStyle(0x1b1f3a, 0.12);
          shadows.fillPoints([{ x: c.x - HW, y: c.y }, { x: c.x, y: c.y + HH }, { x: c.x - 4, y: c.y + HH + 3 }, { x: c.x - HW - 4, y: c.y + 3 }], true);
        }
        const g = twin(this, depthAt(t.x, t.y), this.darks); // le bâtiment + son double de nuit
        const lg = this.add.graphics().setDepth(depthAt(t.x, t.y) + 0.1).setAlpha(0);
        drawBuildingTile(g, lg, c.x, c.y, b.height, T, info);
        this.lights.push(lg);
        this.hulls.push({
          b, depth: g.depth, g, d: this.darks[this.darks.length - 1], lg,
          poly: new Phaser.Geom.Polygon([
            c.x, c.y - HH - b.height, c.x + HW, c.y - b.height, c.x + HW, c.y,
            c.x, c.y + HH, c.x - HW, c.y, c.x - HW, c.y - b.height,
          ]),
        });
        sx += c.x; sy += c.y; top = Math.min(top, c.y - HH - b.height);
      }
      this.addBubble(b, sx / b.tiles.length, top - 8, T.icon);
    }
    this.drawFillers(shadows);
    this.hulls.sort((a, b) => b.depth - a.depth);
  }

  // Couleur propre à chaque bâtiment : chaque logement a sa façade, chaque commerce la teinte de son métier,
  // et les toits varient (zinc, ardoise, tuile, cuivre). Les services gardent leur apparence (police, hôpital…).
  lookFor(b) {
    const T = TYPES[b.type];
    const roof = ROOFS[(b.id * 3 + 1) % ROOFS.length];
    if (b.type === 'home') {
      const col = FACADES[(b.id * 5) % FACADES.length];
      return { ...T, left: col, right: shade(col, 0.86), roof };
    }
    if (SHOP_TINT[b.type]) {
      const col = shade(SHOP_TINT[b.type], 0.97 + (b.id % 3) * 0.025);
      return { ...T, left: col, right: shade(col, 0.86), roof };
    }
    return T;
  }

  // Immeubles de décor (X sur la carte) : des parcelles de 2×2 cases, chacune avec sa hauteur, sa pierre,
  // son toit et parfois une boutique au rez-de-chaussée. Ce sont eux qui donnent l'effet « vraie ville ».
  drawFillers(shadows) {
    const tiles = this.map.tiles;
    const isF = (x, y) => !!(tiles[y] && tiles[y][x] && tiles[y][x].deco === 'filler');
    const lot = (x, y) => (isF(x, y) ? `${x >> 1},${y >> 1}` : null);
    const STONE = FACADES;
    const ROOF = ROOFS;
    const AWN = [0xd8504d, 0x3fae73, 0x2b4ea2, 0xe5a33a, 0x8a3a6b, 0x2f7d5b];
    const lots = new Map();
    for (let y = 0; y < this.map.h; y++) for (let x = 0; x < this.map.w; x++) {
      if (!isF(x, y)) continue;
      const key = lot(x, y);
      if (!lots.has(key)) {
        const r = rng((x >> 1) * 92821 + (y >> 1) * 68917 + 7);
        const wall = STONE[Math.floor(r() * STONE.length)];
        const shop = r() < 0.35;
        lots.set(key, {
          height: [60, 72, 72, 84, 96][Math.floor(r() * 5)],
          type: shop ? 'shop' : 'home',
          T: {
            ...TYPES.home, left: wall, right: shade(wall, 0.86), roof: ROOF[Math.floor(r() * ROOF.length)],
            ...(shop ? { awning: AWN[Math.floor(r() * AWN.length)], firstFloor: 30 } : {}),
          },
        });
      }
      const L = lots.get(key);
      const c = toScreen(x, y);
      const info = {
        type: L.type, expL: lot(x, y + 1) !== key, expR: lot(x + 1, y) !== key,
        expBL: lot(x - 1, y) !== key, expBR: lot(x, y - 1) !== key,
        r: rng((x + 3) * 7919 + (y + 5) * 104729), door: false,
      };
      if (info.expR) drawShadow(shadows, c.x, c.y, L.height);
      const g = twin(this, depthAt(x, y), this.darks);
      const lg = this.add.graphics().setDepth(depthAt(x, y) + 0.1).setAlpha(0);
      drawBuildingTile(g, lg, c.x, c.y, L.height, L.T, info);
      this.lights.push(lg);
      this.hulls.push({
        b: null, depth: g.depth, g, d: this.darks[this.darks.length - 1], lg,
        poly: new Phaser.Geom.Polygon([
          c.x, c.y - HH - L.height, c.x + HW, c.y - L.height, c.x + HW, c.y,
          c.x, c.y + HH, c.x - HW, c.y, c.x - HW, c.y - L.height,
        ]),
      });
    }
  }

  addBubble(b, x, y, icon) {
    const c = this.add.container(x, y).setDepth(100000);
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.94); bg.fillRoundedRect(-16, -28, 32, 26, 9);
    bg.fillTriangle(-5, -3, 5, -3, 0, 4);
    const t = this.add.text(0, -15, icon, { fontFamily: EMOJI_FONT, fontSize: '17px' }).setOrigin(0.5).setResolution(4);
    c.add([bg, t]);
    this.tweens.add({ targets: c, y: y - 3, duration: 1400 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.bubbles.push({ b, c, t });
  }

  // Icônes des logements : 🏠 chez toi, 🔑 libre (à louer / vendre), rien chez les PNJ
  syncHomeBubbles() {
    const p = state.player;
    for (const { b, c, t } of this.bubbles) {
      if (b.type !== 'home') continue;
      const mine = b.id === p.home;
      const vacant = freeUnits(this.world, b) > 0;
      c.base = mine || vacant; // visibilité « de base » ; declutter() masque ensuite les bulles qui se chevauchent
      const icon = mine ? (p.housing === 'own' ? '🔑' : '🏠') : '🔑';
      if (t.text !== icon) t.setText(icon);
    }
    // Commerces fermés (faillite) : une pancarte à la place de l'icône
    for (const { b, t } of this.bubbles) {
      if (b.type === 'home') continue;
      const icon = isClosed(this.world, b.id) ? '🔒' : TYPES[b.type].icon;
      if (t.text !== icon) t.setText(icon);
    }
  }

  // ---------- Personnages ----------
  addActorView(a) {
    const spr = this.add.image(0, 0, ensureCharTexture(this, a)).setOrigin(0.5, 0.93).setScale(1.5);
    let marker = null, ring = null;
    if (a.isPlayer) {
      // Le joueur se repère tout de suite : flèche + anneau lumineux au sol
      marker = this.add.image(0, 0, 'marker').setDepth(99999);
      ring = this.add.image(0, 0, 'ring');
      this.tweens.add({ targets: ring, scale: 1.25, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    const veh = this.add.image(0, 0, 'veh_velo').setOrigin(0.5, 0.85).setScale(1.3).setVisible(false);
    this.views.set(a.id, { a, spr, marker, ring, veh });
  }

  syncViews(time) {
    for (const v of this.views.values()) {
      const a = v.a;
      const s = toScreen(a.px, a.py);
      const bob = a.moving ? -Math.abs(Math.sin(time * 0.0185)) * 1.5 : 0;
      // Apparence (recréée si elle a changé) + animation de marche (2 pas qui alternent)
      ensureCharTexture(this, a);
      const walking = a.moving && a.outdoors && !a.vehicle;
      const step = Math.floor(time / 170) % 2 ? 1 : 2;
      // de face ou de dos selon la direction ; au repos, une légère respiration (décalée d'un habitant à l'autre)
      const idle = Math.floor((time + (a.id.charCodeAt(a.id.length - 1) * 97)) / 700) % 2 ? '_i' : '';
      const key = walking ? `${a.texKey}${a.away ? `_b${step}` : `_${step}`}` : `${a.texKey}${a.moving ? '' : idle}`;
      if (v.spr.texture.key !== key) v.spr.setTexture(key);
      v.spr.setPosition(s.x, s.y + bob).setDepth(depthAt(a.px, a.py) + 5).setFlipX(a.facing < 0).setVisible(a.outdoors);
      // En véhicule dans la rue
      const ride = a.vehicle && a.outdoors && a.moving ? a.vehicle : null;
      if (ride === 'voiture') {
        v.veh.setTexture(`car_${a.id.charCodeAt(a.id.length - 1) % 6}`).setOrigin(0.5, 0.65).setScale(1)
          .setPosition(s.x, s.y).setDepth(depthAt(a.px, a.py) + 5).setVisible(true);
        v.spr.setVisible(false);
      } else if (ride) {
        v.veh.setTexture(`veh_${ride}`).setOrigin(0.5, 0.85).setScale(1.3)
          .setPosition(s.x, s.y + 2).setDepth(depthAt(a.px, a.py) + 4.9).setFlipX(a.facing < 0).setVisible(true);
        v.spr.setY(s.y - 6);
      } else v.veh.setVisible(false);
      // La nuit, les personnages et véhicules sont dans l'ombre comme le reste
      v.spr.setTint(this.nightTint || 0xffffff);
      v.veh.setTint(this.nightTint || 0xffffff);
      if (v.marker) v.marker.setPosition(s.x, s.y - (a.outdoors ? 48 : 20) + this.markerBob.o);
      if (v.ring) v.ring.setPosition(s.x, s.y + 1).setDepth(depthAt(a.px, a.py) + 4.8).setVisible(a.outdoors);
    }
  }

  // ---------- Caméra ----------
  setupCamera() {
    const { w, h } = this.map;
    this.bounds = {
      minX: toScreen(0, h - 1).x - HW, maxX: toScreen(w - 1, 0).x + HW,
      minY: toScreen(0, 0).y - 120, maxY: toScreen(w - 1, h - 1).y + 80,
    };
    const cam = this.cameras.main;
    const fit = () => Math.min(cam.width / (this.bounds.maxX - this.bounds.minX), cam.height / (this.bounds.maxY - this.bounds.minY));
    this.minZoom = fit() * 0.8;
    this.maxZoom = 3 * (state.dpr || 1);
    cam.setZoom(Phaser.Math.Clamp(fit() * 1.8, this.minZoom, this.maxZoom));
    this.centerOnPlayer();
    this.scale.on('resize', () => { this.minZoom = fit() * 0.8; this.setZoom(cam.zoom); });
  }

  setZoom(z) { this.cameras.main.setZoom(Phaser.Math.Clamp(z, this.minZoom, this.maxZoom)); }

  centerOnPlayer() {
    const p = state.player;
    const s = toScreen(p.px, p.py);
    this.cameras.main.centerOn(s.x, s.y - 20);
  }

  // Montrer un lieu ou une personne : la caméra glisse jusqu'à lui et une flèche le désigne
  focusBuilding(b) {
    let sx = 0, sy = 0, top = Infinity;
    for (const t of b.tiles) { const c = toScreen(t.x, t.y); sx += c.x; sy += c.y; top = Math.min(top, c.y - HH - b.height); }
    sx /= b.tiles.length; sy /= b.tiles.length;
    this.panTo(sx, sy - b.height / 2);
    this.pointAt(sx, top - 36);
  }

  focusActor(a) {
    const s = toScreen(a.px, a.py);
    this.panTo(s.x, s.y - 20);
    this.pointAt(s.x, s.y - 62, a);
  }

  panTo(x, y) {
    const cam = this.cameras.main;
    if (this.cameras.main.zoom < this.minZoom * 1.6) this.setZoom(this.minZoom * 1.8);
    cam.pan(x, y, 700, 'Sine.easeInOut');
  }

  pointAt(x, y, follow = null) {
    if (this.pointer) this.pointer.destroy();
    const arrow = this.add.image(x, y, 'marker').setScale(2.2).setDepth(200001).setTint(0xff7a59);
    this.pointer = arrow;
    const bob = { o: 0 };
    this.tweens.add({ targets: bob, o: -10, duration: 380, yoyo: true, repeat: 9, ease: 'Sine.inOut',
      onUpdate: () => {
        if (!arrow.active) return;
        if (follow) { const s = toScreen(follow.px, follow.py); arrow.setPosition(s.x, s.y - 62 + bob.o); }
        else arrow.setY(y + bob.o);
      },
      onComplete: () => { if (arrow.active) this.tweens.add({ targets: arrow, alpha: 0, duration: 400, onComplete: () => arrow.destroy() }); } });
  }

  clampCamera() {
    const cam = this.cameras.main, b = this.bounds;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, b.minX, b.maxX);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, b.minY, b.maxY);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }

  // ---------- Toucher la carte ----------
  tap(p) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // Toucher un habitant dans la rue
    for (const v of this.views.values()) {
      const a = v.a;
      if (a.isPlayer || !a.outdoors) continue;
      // zone de toucher généreuse (doigts sur téléphone)
      if (Math.abs(wp.x - v.spr.x) < 18 && wp.y > v.spr.y - 52 && wp.y < v.spr.y + 8) return state.ui.showPerson(a);
    }
    // Objets de la rue : pigeons, fontaine, bancs
    const nearScreen = (x, y, r) => { const s = toScreen(x, y); return Math.hypot(wp.x - s.x, wp.y - (s.y - 6)) < r; };
    const pigeon = this.birds.pigeons.find(pg => pg.flying <= 0 && nearScreen(pg.x, pg.y, 14));
    if (pigeon) return state.ui.showObject({ name: 'Pigeons', icon: '🐦', actions: ['feed_pigeons'], at: { x: pigeon.x, y: pigeon.y } });
    // Stands, tables, scène, musiciens des fêtes
    const fs = this.fest.spots.find(s => nearScreen(s.x, s.y, 24) || nearScreen(s.x - 0.3, s.y - 0.3, 18));
    if (fs) return state.ui.showObject({ name: fs.name, icon: fs.icon, actions: fs.actions, at: fs });
    const st = this.spots.statues.find(s => Math.abs(wp.x - toScreen(s.x, s.y).x) < 16 && wp.y > toScreen(s.x, s.y).y - 70 && wp.y < toScreen(s.x, s.y).y + 8);
    if (st) return state.ui.showObject({ name: 'Statue de Marianne', icon: '🗽', actions: ['admire_statue'], at: st });
    const f = this.spots.fountains.find(s => nearScreen(s.x, s.y, 26));
    if (f) return state.ui.showObject({ name: 'Fontaine', icon: '⛲', actions: ['wish_fountain'], at: f });
    const bench = this.spots.benches.find(s => nearScreen(s.x, s.y, 16));
    if (bench) return state.ui.showObject({ name: 'Banc', icon: '🪑', actions: ['sit_bench', 'feed_pigeons'], at: bench });

    for (const { b, c } of this.bubbles) {
      if (!c.visible) continue;
      if (Math.abs(wp.x - c.x) < 18 && wp.y > c.y - 30 && wp.y < c.y + 4) return state.ui.showPlace(b);
    }
    for (const hl of this.hulls) {
      // (immeuble de décor : rien à faire, mais le toucher ne doit pas ouvrir le lieu caché derrière)
      if (Phaser.Geom.Polygon.Contains(hl.poly, wp.x, wp.y)) return hl.b ? state.ui.showPlace(hl.b) : this.floatText('🏢 Immeuble d’habitation privé', '#7a6f96');
    }
    const t = toTile(wp.x, wp.y);
    if (!this.map.walk(t.x, t.y)) return;
    const r = this.world.perform(state.player, 'goto', t);
    if (r.ok) this.ping(t);
  }

  ping(t) {
    const s = toScreen(t.x, t.y);
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokePoints([{ x: s.x, y: s.y - HH }, { x: s.x + HW, y: s.y }, { x: s.x, y: s.y + HH }, { x: s.x - HW, y: s.y }], true);
    this.tweens.add({ targets: g, alpha: 0, duration: 700, onComplete: () => g.destroy() });
  }

  // ---------- Retours visuels ----------
  listen() {
    const isMe = e => e.actor === state.player;
    this.world.on('done', e => { if (isMe(e)) this.floatDelta(e); });
    this.world.on('fail', e => { if (isMe(e)) this.floatText(e.reason, '#e2475b'); });
    // La ville vivante : des habitants arrivent, d'autres s'en vont
    this.world.on('actorAdded', e => this.addActorView(e.actor));
    this.world.on('actorRemoved', e => {
      const v = this.views.get(e.actor.id);
      if (!v) return;
      for (const o of [v.spr, v.marker, v.ring, v.veh]) if (o) o.destroy();
      this.views.delete(e.actor.id);
    });
    // Un commerce repris change de nom : l'icône reste, le nom suit dans les fiches
    this.world.on('bizOpened', () => this.syncHomeBubbles());
  }

  floatDelta(e) {
    const d = e.delta, parts = [];
    if (Math.abs(d.money) >= 0.5) parts.push(`${d.money > 0 ? '+' : ''}${Math.round(d.money * 10) / 10} €`);
    if (Math.abs(d.energy) >= 1) parts.push(`⚡${d.energy > 0 ? '+' : ''}${Math.round(d.energy)}`);
    if (Math.abs(d.hunger) >= 1) parts.push(`🍔${d.hunger < 0 ? '+' : ''}${Math.round(-d.hunger)}`);
    if (d.mood && Math.abs(d.mood) >= 1) parts.push(`😊${d.mood > 0 ? '+' : ''}${Math.round(d.mood)}`);
    if (e.msg) parts.push(e.msg);
    if (parts.length) this.floatText(parts.join('  '), d.money < 0 ? '#3d3357' : '#2e8b57');
  }

  floatText(str, color) {
    const p = state.player;
    const s = toScreen(p.px, p.py);
    this.floatN = ((this.floatN || 0) + 1) % 3;
    const t = this.add.text(s.x, s.y - 60 - this.floatN * 16, str, {
      fontFamily: `system-ui,${EMOJI_FONT}`, fontSize: '13px', fontStyle: 'bold', color,
      stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200000).setResolution(4);
    this.tweens.add({ targets: t, y: t.y - 34, alpha: 0, delay: 900, duration: 1300, onComplete: () => t.destroy() });
  }
}
