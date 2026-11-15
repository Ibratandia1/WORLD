import { TW, TH, toScreen, toTile } from '../iso.js';
import { TYPES } from '../map/types.js';
import { ACTIONS } from '../sim/actions.js';
import { state } from '../state.js';
import { ensureCharTexture, randomLook } from '../look.js';
import { attachControls } from '../camera.js';
import { findPath } from '../sim/pathfinding.js';
import { freeUnits, isClosed } from '../sim/city.js';
import { drawBuildingTile, drawShadow, drawGroundDetails, drawStreetDecor, makeCarTextures, Traffic, Crowd, rng, makeBirdTextures, Birds, twin, NIGHT, NIGHT_MAX } from '../city/render.js';

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
    this.spots = drawStreetDecor(this, this.map, this.lights, this.darks);
    this.traffic = new Traffic(this, this.map);
    this.crowd = new Crowd(this, this.map, randomLook, ensureCharTexture);
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
    this.crowd.update(delta, this.world.hour, findPath, this.world.paused);
    if ((this.lightTick = (this.lightTick || 0) + delta) > 400) { this.lightTick = 0; this.syncLights(); }
    this.syncViews(time);
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

  // Les fenêtres s'allument à la tombée de la nuit
  syncLights() {
    const h = this.world.hour;
    let night = 0;
    if (h >= 19 && h < 22) night = (h - 19) / 3;
    else if (h >= 22 || h < 5.5) night = 1;
    else if (h >= 5.5 && h < 7.5) night = 1 - (h - 5.5) / 2;
    for (const lg of this.lights) lg.setAlpha(night);
    for (const d of this.darks) d.setAlpha(night * NIGHT_MAX);
    // Teinte des personnages / voitures / oiseaux (sprites)
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(0x3a3f5c), 100, Math.round(night * 100));
    this.nightTint = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }

  drawBuildings() {
    const shadows = this.add.graphics().setDepth(0.5);
    const at = (x, y) => (this.map.tiles[y] && this.map.tiles[y][x] ? this.map.tiles[y][x].building : null);
    for (const b of this.map.buildings) {
      const T = TYPES[b.type];
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
          b, depth: g.depth,
          poly: new Phaser.Geom.Polygon([
            c.x, c.y - HH - b.height, c.x + HW, c.y - b.height, c.x + HW, c.y,
            c.x, c.y + HH, c.x - HW, c.y, c.x - HW, c.y - b.height,
          ]),
        });
        sx += c.x; sy += c.y; top = Math.min(top, c.y - HH - b.height);
      }
      this.addBubble(b, sx / b.tiles.length, top - 8, T.icon);
    }
    this.hulls.sort((a, b) => b.depth - a.depth);
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
      c.setVisible(mine || vacant);
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
      const key = walking ? `${a.texKey}_${Math.floor(time / 170) % 2 ? 1 : 2}` : a.texKey;
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
      if (Math.abs(wp.x - v.spr.x) < 13 && wp.y > v.spr.y - 46 && wp.y < v.spr.y + 4) return state.ui.showPerson(a);
    }
    // Objets de la rue : pigeons, fontaine, bancs
    const nearScreen = (x, y, r) => { const s = toScreen(x, y); return Math.hypot(wp.x - s.x, wp.y - (s.y - 6)) < r; };
    const pigeon = this.birds.pigeons.find(pg => pg.flying <= 0 && nearScreen(pg.x, pg.y, 14));
    if (pigeon) return state.ui.showObject({ name: 'Pigeons', icon: '🐦', actions: ['feed_pigeons'], at: { x: pigeon.x, y: pigeon.y } });
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
      if (Phaser.Geom.Polygon.Contains(hl.poly, wp.x, wp.y)) return state.ui.showPlace(hl.b);
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
