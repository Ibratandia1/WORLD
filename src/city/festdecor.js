import { toScreen } from '../iso.js';
import { isoBox, twin, depthAt, rng } from './render.js';
import { shade } from '../color.js';
import { ensureCharTexture, randomLook } from '../look.js';

// Décors des fêtes du quartier : stands du marché, tables de la brocante, scène du concert, musiciens de rue.
// Créés quand la fête commence, retirés quand elle finit. Touchables (spots) pour participer.
const STALL_COLORS = [0xd8504d, 0x3fae73, 0x2b4ea2, 0xe5a33a, 0x9b6ee8, 0x2f7d5b];
const PRODUCE = [0xe8504d, 0xf2c94c, 0x4caf50, 0xf08a3c, 0x9b6ee8, 0xffffff, 0x7a4b2a];

export class FestDecor {
  constructor(scene) {
    this.scene = scene;
    this.items = {};   // id de la fête -> { objs, darks, sprites, lights }
    this.spots = [];   // { x, y, fest, name, icon, actions }
    this.notes = [];
    this.noteIn = 0;
  }

  // Cases libres (praticables, sans décor) autour d'un lieu, de façon déterministe
  freeTiles(cx, cy, r, grounds, n, seed) {
    const t = this.scene.map.tiles, out = [];
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const c = t[y] && t[y][x];
      if (!c || !c.walk || c.deco || !grounds.includes(c.ground) || Math.hypot(x - cx, y - cy) > r || (x === cx && y === cy)) continue;
      out.push({ x, y });
    }
    const r2 = rng(seed);
    out.sort(() => r2() - 0.5);
    return out.slice(0, n);
  }

  layer(id) { return (this.items[id] = this.items[id] || { objs: [], darks: [], sprites: [], lights: [], players: [] }); }

  g(id, depth) {
    const L = this.layer(id), sc = this.scene;
    const gg = twin(sc, depth, sc.darks);
    L.objs.push(gg); L.darks.push(sc.darks[sc.darks.length - 1]);
    return gg;
  }

  person(id, x, y, flip = false, play = false) {
    const sc = this.scene, L = this.layer(id);
    if (!sc.sys.game.renderer) return null; // moteur 2D sans affichage (ville en 3D) : pas de figurants 2D, seulement les stands
    const fake = { id: `fest_${id}_${L.sprites.length}`, look: randomLook() };
    ensureCharTexture(sc, fake);
    const s = toScreen(x, y);
    const spr = sc.add.image(s.x, s.y, fake.texKey).setOrigin(0.5, 0.93).setScale(1.5).setDepth(depthAt(x, y) + 5).setFlipX(flip);
    spr.fake = fake;
    L.sprites.push(spr);
    if (play) L.players.push({ x, y, spr });
    return spr;
  }

  show(fest) {
    if (this.items[fest.id]) return;
    const sc = this.scene, places = sc.map.places || {};
    const P = places[fest.where];
    if (fest.id === 'marche' && P) this.market(fest, P);
    if (fest.id === 'brocante' && P) this.brocante(fest, P);
    if (fest.id === 'concert' && P) this.concert(fest, P);
    if (fest.id === 'musique') this.buskers(fest);
  }

  hide(fest) {
    const L = this.items[fest.id];
    if (!L) return;
    const sc = this.scene;
    L.objs.forEach(o => o.destroy());
    L.darks.forEach(d => { d.destroy(); sc.darks.splice(sc.darks.indexOf(d), 1); });
    L.lights.forEach(l => { l.destroy(); sc.lights.splice(sc.lights.indexOf(l), 1); });
    L.sprites.forEach(s => {
      for (const k of ['', '_1', '_2', '_i', '_b0', '_b1', '_b2']) if (sc.textures.exists(s.fake.texKey + k)) sc.textures.remove(s.fake.texKey + k);
      s.destroy();
    });
    delete this.items[fest.id];
    this.spots = this.spots.filter(s => s.fest !== fest.id);
  }

  // ---------- Marché : stands à rayures, cagettes de fruits et légumes, marchands ----------
  market(fest, P) {
    const tiles = this.freeTiles(P.x, P.y, 3.2, ['cobble', 'pave'], 7, 314);
    tiles.forEach((t, i) => {
      const s = toScreen(t.x, t.y);
      const col = STALL_COLORS[i % STALL_COLORS.length];
      const g = this.g(fest.id, depthAt(t.x, t.y) + 2.5);
      g.fillStyle(0x000000, 0.15); g.fillEllipse(s.x + 3, s.y + 3, 50, 18);
      isoBox(g, s.x, s.y, 0.8, 0.45, 12, { top: 0xc9a06a, left: 0x8a5a3c, right: 0x734a32 });
      const r2 = rng(t.x * 31 + t.y * 17);
      for (let k = 0; k < 9; k++) { g.fillStyle(PRODUCE[Math.floor(r2() * PRODUCE.length)]); g.fillCircle(s.x - 14 + (k % 5) * 7 + r2() * 2, s.y - 14 - Math.floor(k / 5) * 3 + r2() * 2, 2.4); }
      g.fillStyle(0x34323d); g.fillRect(s.x - 20, s.y - 34, 2, 30); g.fillRect(s.x + 18, s.y - 34, 2, 30);
      for (let k = 0; k < 6; k++) { g.fillStyle(k % 2 ? 0xffffff : col); g.fillRect(s.x - 22 + k * 7.5, s.y - 40, 7.5, 7); }
      g.fillStyle(shade(col, 0.75)); g.fillRect(s.x - 22, s.y - 33, 45, 2);
      this.person(fest.id, t.x - 0.35, t.y - 0.35, i % 2 === 0);
      this.spots.push({ x: t.x, y: t.y, fest: fest.id, name: 'Stand du marché', icon: '🧺', actions: ['market_buy', 'crepe'] });
    });
  }

  // ---------- Brocante : tables d'objets anciens ----------
  brocante(fest, P) {
    const tiles = this.freeTiles(P.x, P.y, 3.5, ['grass', 'pave', 'cobble'], 6, 77);
    tiles.forEach((t, i) => {
      const s = toScreen(t.x, t.y);
      const g = this.g(fest.id, depthAt(t.x, t.y) + 2.5);
      g.fillStyle(0x000000, 0.15); g.fillEllipse(s.x + 3, s.y + 3, 46, 16);
      isoBox(g, s.x, s.y, 0.75, 0.42, 10, { top: 0xf2efe8, left: 0xd8d2c4, right: 0xc4bdae });
      // objets : cadre, vase, lampe, livres, horloge
      g.fillStyle(0xb8963c); g.fillRect(s.x - 16, s.y - 22, 9, 8); g.fillStyle(0x6d8fb3); g.fillRect(s.x - 14, s.y - 20, 5, 4);
      g.fillStyle(0x5f8f7f); g.fillEllipse(s.x - 2, s.y - 15, 6, 9);
      g.fillStyle(0xd8504d); g.fillRect(s.x + 5, s.y - 14, 8, 3); g.fillStyle(0x2b4ea2); g.fillRect(s.x + 5, s.y - 17, 8, 3);
      g.fillStyle(0xf2c94c); g.fillTriangle(s.x + 15, s.y - 26, s.x + 21, s.y - 26, s.x + 18, s.y - 20); g.fillStyle(0x34323d); g.fillRect(s.x + 17, s.y - 20, 2, 7);
      this.person(fest.id, t.x - 0.35, t.y - 0.3, i % 2 === 1);
      this.spots.push({ x: t.x, y: t.y, fest: fest.id, name: 'Table de brocante', icon: '🏺', actions: ['brocante_hunt', 'crepe'] });
    });
  }

  // ---------- Concert : scène en bois, musiciens, guirlandes lumineuses ----------
  concert(fest, P) {
    const sc = this.scene;
    const t = this.freeTiles(P.x, P.y, 2.5, ['grass', 'pave', 'cobble'], 1, 5)[0] || { x: P.x + 1, y: P.y };
    const s = toScreen(t.x, t.y);
    const g = this.g(fest.id, depthAt(t.x, t.y) + 1.5);
    g.fillStyle(0x000000, 0.2); g.fillEllipse(s.x + 4, s.y + 6, 110, 40);
    isoBox(g, s.x, s.y, 1.7, 1.1, 7, { top: 0xb98458, left: 0x8a5a3c, right: 0x734a32 });
    g.fillStyle(0x34323d); g.fillRect(s.x - 48, s.y - 60, 3, 58); g.fillRect(s.x + 46, s.y - 60, 3, 58);
    [[-0.45, 0], [0.1, -0.25], [0.5, 0.15]].forEach(([dx, dy], i) => this.person(fest.id, t.x + dx, t.y + dy, i === 2, true));
    // guirlande (s'allume la nuit)
    const lights = sc.add.graphics().setDepth(depthAt(t.x, t.y) + 6).setBlendMode(Phaser.BlendModes.ADD);
    for (let k = 0; k <= 12; k++) {
      const x = s.x - 46 + k * 7.7, y = s.y - 58 + Math.sin((k / 12) * Math.PI) * 10;
      lights.fillStyle([0xffd27a, 0xff8a8a, 0x8ad1ff, 0xb7ff8a][k % 4], 0.9); lights.fillCircle(x, y, 2.2);
      lights.fillStyle(0xffd27a, 0.15); lights.fillCircle(x, y, 6);
    }
    this.layer(fest.id).lights.push(lights); sc.lights.push(lights);
    g.lineStyle(1, 0x34323d, 0.8);
    for (let k = 0; k < 12; k++) {
      const x1 = s.x - 46 + k * 7.7, x2 = x1 + 7.7;
      g.lineBetween(x1, s.y - 58 + Math.sin((k / 12) * Math.PI) * 10, x2, s.y - 58 + Math.sin(((k + 1) / 12) * Math.PI) * 10);
    }
    this.spots.push({ x: t.x, y: t.y, fest: fest.id, name: 'Concert', icon: '🎻', actions: ['dance'] });
  }

  // ---------- Fête de la musique : musiciens aux coins de rue ----------
  buskers(fest) {
    const sc = this.scene, t = sc.map.tiles;
    const corners = sc.map.footpaths.filter(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => t[p.y + dy] && t[p.y + dy][p.x + dx] && t[p.y + dy][p.x + dx].ground === 'road').length >= 2);
    const r2 = rng(2024);
    const picks = corners.sort(() => r2() - 0.5).slice(0, 6);
    picks.forEach((p, i) => {
      this.person(fest.id, p.x, p.y, i % 2 === 0, true);
      this.spots.push({ x: p.x, y: p.y, fest: fest.id, name: 'Musiciens', icon: '🎶', actions: ['dance', 'crepe'] });
    });
  }

  // Notes de musique qui s'envolent, teinte de nuit, petits mouvements des musiciens
  update(dt) {
    const sc = this.scene, tint = sc.nightTint || 0xffffff;
    for (const L of Object.values(this.items)) {
      L.sprites.forEach(s => s.setTint(tint));
      L.players.forEach((m, i) => m.spr.setY(toScreen(m.x, m.y).y - (Math.floor((sc.time.now + i * 160) / 320) % 2)));
    }
    this.noteIn -= dt;
    const players = Object.values(this.items).flatMap(L => L.players);
    if (players.length && this.noteIn <= 0) {
      this.noteIn = 260;
      const m = players[Math.floor(Math.random() * players.length)];
      const s = toScreen(m.x, m.y);
      const n = sc.add.text(s.x + (Math.random() - 0.5) * 10, s.y - 44, Math.random() < 0.5 ? '♪' : '♫', {
        fontFamily: 'system-ui,sans-serif', fontSize: '14px', fontStyle: 'bold', color: ['#7b5cf0', '#e2475b', '#2e8b57', '#e5a33a'][Math.floor(Math.random() * 4)],
        stroke: '#ffffff', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(150000).setResolution(3);
      sc.tweens.add({ targets: n, y: n.y - 34, x: n.x + (Math.random() - 0.5) * 24, alpha: 0, duration: 1600, onComplete: () => n.destroy() });
    }
  }
}
