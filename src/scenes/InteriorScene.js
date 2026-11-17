import { t } from '../i18n.js';
import { toScreen, toTile } from '../iso.js';
import { LAYOUTS, floorsOf } from '../interiors/layouts.js';
import { FLOOR_ITEMS, WALL_ITEMS, P, planeX, planeY, quad, block } from '../interiors/furniture.js';
import { ACTIONS } from '../sim/actions.js';
import { TYPES } from '../map/types.js';
import { ensureCharTexture, ensurePose } from '../look.js';
import { attachControls } from '../camera.js';

// Noms des meubles et usages par défaut (quand le plan ne leur donne pas d'action)
const ITEM_NAMES = {
  desk: 'Bureau', chair: 'Chaise', stool: 'Tabouret', plant: 'Plante', bigplant: 'Grande plante', meeting: 'Table de réunion',
  counter: 'Comptoir', coffee: 'Machine à café', register: 'Caisse', urne: 'Urne', flagstand: 'Drapeau', bust: 'Buste de Marianne',
  reception: 'Accueil', sofa: 'Canapé', tablec: 'Table', vending: 'Distributeur', cooler: 'Fontaine à eau', printer: 'Imprimante',
  bossdesk: 'Grand bureau', armchair: 'Fauteuil', bookshelf: 'Bibliothèque', bed: 'Lit', nightstand: 'Table de nuit', tvstand: 'Télé',
  fridge: 'Frigo', kitchen: 'Cuisine', tableh: 'Table', breadshelf: 'Étagère à pain', display: 'Vitrine', oven: 'Four',
  worktable: 'Plan de travail', sacks: 'Sacs de farine', bench: 'Banc', shelf: 'Rayon', fridgeglass: 'Frigo vitré', rack: 'Portant',
  foldtable: 'Table de pliage', fitting: 'Cabine d’essayage', carshow: 'Véhicule exposé', tires: 'Pneus', workbench: 'Établi',
  bike: 'Vélo', cakes: 'Gâteaux', rug: 'Tapis',
  safe: 'Coffre-fort', glasscounter: 'Guichet', atm: 'Distributeur de billets', judgebench: 'Estrade du juge', bar: 'Barre', bin: 'Poubelle',
};
const genericActions = k => {
  if (['chair', 'stool', 'bench', 'sofa', 'armchair'].includes(k)) return ['sit_here', 'inspect'];
  if (k === 'vending') return ['vending_snack', 'inspect'];
  if (k === 'cooler') return ['drink_water', 'inspect'];
  if (k === 'bookshelf') return ['browse_books', 'inspect'];
  if (k === 'plant' || k === 'bigplant') return ['water_plant', 'inspect'];
  return ['inspect'];
};
import { shade } from '../color.js';
import { state } from '../state.js';

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const depthAt = (x, y) => 10 + (x + y) * 10;
const hash = s => [...s].reduce((h, c) => h + c.charCodeAt(0), 0);
const TOP = 1e6;
const PIXELATE = 0;     // filtre pixel art : désactivé (il rendait l'image floue)
const LEVEL_H = 26;     // hauteur d'un étage dans le socle sous la pièce

// Poses animées (2 images qui alternent)
const ANIM = { eat: ['eat1', 'eat2'], drink: ['drink1', 'drink2'], cook: ['cook1', 'cook2'], type: ['type1', 'type2'] };

// Quelle pose pour quelle action, à quelle place (façon Sims)
function poseFor(act, st) {
  if ((st && st.lie) || act === 'nap') return 'lie';
  if (act === 'watch_tv') return 'back_sit';      // de dos, face à la télé
  if (act === 'read_book') return 'read';
  if (act === 'cook') return 'cook';               // aux fourneaux
  if (act === 'eat_home' || act === 'eat_cafe') return 'eat';
  if (act === 'coffee' || act === 'treat') return 'drink';
  if ((act === 'work' || act === 'overtime') && st && st.pose) return st.pose;
  if (st && st.seat) return 'sit';
  return 'stand';
}

// Vue de l'intérieur du lieu où se trouve le joueur, étage par étage.
// Deux caméras : la pièce (avec filtre pixel art) et les étiquettes (toujours nettes).
export class InteriorScene extends Phaser.Scene {
  constructor() { super('interior'); }

  create() {
    state.interior = this;
    this.building = null;
    this.objs = [];
    this.pills = [];
    this.views = new Map();
    this.sig = '';

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    const cam = this.cameras.main;
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    cam.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);
    // Filtre pixel art net : la taille des « pixels » suit la densité de l'écran
    if (PIXELATE && cam.postFX) cam.postFX.addPixelate(Math.max(1, Math.round(PIXELATE * 0.5 * (state.dpr || 1))));

    cam.setVisible(false);
    this.uiCam.setVisible(false);
    this.input.enabled = false;
    this.markerBob = { o: 0 };
    this.tweens.add({ targets: this.markerBob, o: -5, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    attachControls(this, p => this.tap(p));
    this.scale.on('resize', (size) => {
      this.uiCam.setSize(size.width, size.height);
      if (this.building) this.fit();
    });

    const me = e => this.building && e.actor === state.player;
    state.world.on('done', e => { if (me(e)) this.floatDelta(e); });
    state.world.on('fail', e => { if (me(e)) this.floatText(t(e.reason), '#e2475b'); });

    this.floorsEl = document.getElementById('floors');
    this.floorsEl.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) this.setFloor(Number(b.dataset.floor));
    });
  }

  // Objets de la pièce (pixelisés) / objets d'interface (nets)
  w(o) { this.worldLayer.add(o); this.objs.push(o); return o; }
  u(o) { this.uiLayer.add(o); return o; }

  // ---------- Ouverture / fermeture ----------
  show(b) {
    this.clearAll();
    this.building = b;
    this.floors = floorsOf(LAYOUTS[b.type]);
    this.prepareStations();
    this.floorIdx = 0;
    this.playerFloor = null;
    this.buildFloor();
    this.fit();
    this.cameras.main.setVisible(true);
    this.uiCam.setVisible(true);
    this.input.enabled = true;
  }

  hide() {
    this.clearAll();
    this.building = null;
    this.cameras.main.setVisible(false);
    this.uiCam.setVisible(false);
    this.input.enabled = false;
    this.renderFloorButtons();
  }

  clearFloor() {
    this.objs.forEach(o => o.destroy());
    this.objs = [];
    this.pills = [];
  }

  clearAll() {
    this.clearFloor();
    this.views.forEach(v => { v.spr.destroy(); v.tag.c.destroy(); if (v.ring) v.ring.destroy(); });
    this.clearProps();
    this.tvScreen(false);
    this.views.clear();
    this.sig = '';
    if (this.marker) { this.marker.destroy(); this.marker = null; }
  }

  // Places de tous les étages, et cases libres de chaque étage
  prepareStations() {
    const zoneOf = (F, x, y) => F.zones.findIndex(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    this.stations = [];
    this.free = [];
    this.floors.forEach((F, fi) => {
      for (const s of F.stations) {
        const p = toScreen(s.x, s.y);
        this.stations.push({ ...s, floor: fi, sx: p.x, sy: p.y, depth: depthAt(s.x, s.y) + 5, zone: zoneOf(F, s.x, s.y) });
      }
      const taken = new Set([
        ...F.items.filter(it => !it.wall && !it.flat).map(it => `${it.x},${it.y}`),
        ...F.stations.map(s => `${s.x},${s.y}`),
        ...(F.entrance ? [`${F.entrance.x},${F.entrance.y}`] : []),
      ]);
      const list = [];
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
        if (taken.has(`${x},${y}`)) continue;
        const p = toScreen(x, y);
        list.push({ x, y, floor: fi, sx: p.x, sy: p.y, depth: depthAt(x, y) + 5 });
      }
      this.free.push(list);
    });
    this.stations.sort((a, b) => (b.prio || 0) - (a.prio || 0)); // tri stable
  }

  setFloor(i) {
    if (!this.building || i === this.floorIdx || i < 0 || i >= this.floors.length) return;
    this.floorIdx = i;
    this.tvScreen(false);
    this.sig = ''; // on replace tout le monde (accessoires de l'étage)
    this.buildFloor();
    this.fit();
    this.applyVisibility();
    this.updateZoneCounts();
  }

  renderFloorButtons() {
    const el = this.floorsEl;
    if (!this.building || !this.floors || this.floors.length < 2) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const html = this.floors.map((F, i) => {
      const here = this.playerFloor === i ? ' here' : '';
      return `<button data-floor="${i}" class="${i === this.floorIdx ? 'on' : ''}${here}" title="${t(F.name)}">${F.short || i}</button>`;
    }).reverse().join('');
    el.innerHTML = `<span>🏢</span>${html}`;
  }

  // ---------- Boucle ----------
  update(time, delta) {
    if (!this.building) return;
    this.placeActors();
    const k = this.uiScale();
    const v = this.views.get(state.player.id);
    if (v && v.floor === this.floorIdx) {
      if (!this.marker) this.marker = this.u(this.add.image(0, 0, 'marker').setDepth(TOP + 5));
      this.marker.setVisible(true).setScale(k).setPosition(v.spr.x, v.tag.c.y - 20 * k + this.markerBob.o);
    } else if (this.marker) this.marker.setVisible(false);
    for (const p of this.pills) p.c.setScale(k);
    for (const vv of this.views.values()) vv.tag.c.setScale(k);
    this.updateFx(time, delta);
    this.clampCamera();
    // la caméra des étiquettes suit exactement celle de la pièce
    const cam = this.cameras.main;
    this.uiCam.setZoom(cam.zoom).setScroll(cam.scrollX, cam.scrollY);
  }

  uiScale() { return Phaser.Math.Clamp(0.85 * (state.dpr || 1) / this.cameras.main.zoom, 1, 2.6); }

  // ---------- Construction de l'étage affiché ----------
  buildFloor() {
    this.clearFloor();
    const L = this.L = this.floors[this.floorIdx];
    const { w, h } = L;
    this.zoneAt = (x, y) => L.zones.findIndex(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);

    this.drawSlab();
    this.drawWalls();

    // Sol
    const gf = this.w(this.add.graphics().setDepth(0));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const zi = this.zoneAt(x, y);
        const cols = zi >= 0 ? L.zones[zi].floor : L.floor;
        const c = cols[(x + y) % 2];
        const pts = [P(x - 0.5, y - 0.5), P(x + 0.5, y - 0.5), P(x + 0.5, y + 0.5), P(x - 0.5, y + 0.5)];
        gf.fillStyle(c); gf.fillPoints(pts, true);
        gf.lineStyle(1, c); gf.strokePoints(pts, true);
      }
    }

    this.drawPartitions();

    // Mobilier
    this.itemAt = new Map();
    for (const it of L.items) {
      if (it.wall) continue;
      const g = this.w(this.add.graphics());
      g.setDepth(it.flat ? 0.5 : depthAt(it.x, it.y) + (it.on ? 3.5 : 3));
      FLOOR_ITEMS[it.k](g, it.x, it.y, it);
      const key = `${it.x},${it.y}`;
      const prev = this.itemAt.get(key);
      if (!prev || (!prev.action && it.action)) this.itemAt.set(key, it);
    }

    // Les objets qu'on peut toucher brillent doucement (halo doré au sol qui respire)
    const glow = this.w(this.add.graphics().setDepth(1.1)); // au-dessus des sols des pièces (profondeur 1)
    const seen = new Set();
    for (const it of L.items) {
      if (it.wall || it.on || !(it.action || (it.actions && it.actions.length))) continue;
      const key = `${it.x},${it.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = k => [P(it.x - k, it.y - k), P(it.x + k, it.y - k), P(it.x + k, it.y + k), P(it.x - k, it.y + k)];
      glow.fillStyle(0xffc93c, 0.28); glow.fillPoints(d(0.5), true);
      glow.lineStyle(2, 0xffb000, 0.9); glow.strokePoints(d(0.5), true);
    }
    this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.85 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Étiquettes des pièces + nom du lieu (et de l'étage)
    this.zoneLabels = L.zones.map((z, i) => ({ ...this.makeZoneLabel(z), i }));
    const b = this.building;
    const icon = b.type === 'home' ? '🏠' : TYPES[b.type].icon;
    const top = P(-0.5, -0.5, L.wallH);
    const title = this.floors.length > 1 ? `${b.name} · ${t(L.name)}` : b.name;
    this.makePill(top.x, top.y - 16, icon, title, null, 0x3d3357, true);
    // La porte : la toucher (ou l'étiquette) fait sortir directement dans la rue
    if (L.entrance) {
      const d = P(L.entrance.x + 0.15, L.entrance.y + 0.75, 4);
      this.exitPill = this.makePill(d.x, d.y + 28, '🚪', t('Sortir'), null, 0x3fae73, true); // sous le muret : ne chevauche pas les étiquettes des pièces
    } else this.exitPill = null;
    this.renderFloorButtons();
  }

  // Socle sous la pièce : au rez-de-chaussée un bout de trottoir ; aux étages, la façade de l'immeuble en dessous
  drawSlab() {
    const { w, h } = this.L;
    const fi = this.floorIdx;
    const Lc = P(-0.5, h - 0.5), Bc = P(w - 0.5, h - 0.5), Rc = P(w - 0.5, -0.5);
    const g = this.w(this.add.graphics().setDepth(-2));
    const dn = (p, k) => ({ x: p.x, y: p.y + k });
    if (fi === 0) {
      const d = 34, gb = 7;
      g.fillStyle(0x6ea84f); g.fillPoints([Lc, Bc, dn(Bc, gb), dn(Lc, gb)], true);
      g.fillStyle(0x5c9442); g.fillPoints([Bc, Rc, dn(Rc, gb), dn(Bc, gb)], true);
      g.fillStyle(0x8d5b3d); g.fillPoints([dn(Lc, gb), dn(Bc, gb), dn(Bc, d), dn(Lc, d)], true);
      g.fillStyle(0x734a32); g.fillPoints([dn(Bc, gb), dn(Rc, gb), dn(Rc, d), dn(Bc, d)], true);
      return;
    }
    const T = TYPES[this.building.type];
    const d = 8 + fi * LEVEL_H + 14;
    g.fillStyle(shade(T.left, 0.95)); g.fillPoints([Lc, Bc, dn(Bc, d), dn(Lc, d)], true);
    g.fillStyle(shade(T.right, 0.95)); g.fillPoints([Bc, Rc, dn(Rc, d), dn(Bc, d)], true);
    // dalle de l'étage
    g.fillStyle(shade(T.left, 1.08)); g.fillPoints([Lc, Bc, dn(Bc, 6), dn(Lc, 6)], true);
    g.fillStyle(shade(T.right, 1.05)); g.fillPoints([Bc, Rc, dn(Rc, 6), dn(Bc, 6)], true);
    // fenêtres des étages inférieurs
    const along = (A, Z, t, k) => ({ x: A.x + (Z.x - A.x) * t, y: A.y + (Z.y - A.y) * t + k });
    for (let lv = 0; lv < fi; lv++) {
      const y0 = 12 + lv * LEVEL_H;
      for (const [A, Z, col] of [[Lc, Bc, 0x8fb3d6], [Bc, Rc, 0x7699bd]]) {
        const n = Math.round(Math.hypot(Z.x - A.x, Z.y - A.y) / 34);
        for (let i = 0; i < n; i++) {
          const t1 = (i + 0.25) / n, t2 = (i + 0.7) / n;
          g.fillStyle(0xffffff, 0.9);
          g.fillPoints([along(A, Z, t1 - 0.01, y0 - 1), along(A, Z, t2 + 0.01, y0 - 1), along(A, Z, t2 + 0.01, y0 + 13), along(A, Z, t1 - 0.01, y0 + 13)], true);
          g.fillStyle(col);
          g.fillPoints([along(A, Z, t1, y0), along(A, Z, t2, y0), along(A, Z, t2, y0 + 12), along(A, Z, t1, y0 + 12)], true);
        }
      }
    }
  }

  drawWalls() {
    const L = this.L, { w, h, wallH: WH } = L;
    const g = this.w(this.add.graphics().setDepth(1));
    const T = 0.16; // épaisseur
    quad(g, planeX(-0.5, -0.5, h - 0.5, 0, WH), L.wall);
    quad(g, planeY(-0.5, -0.5, w - 0.5, 0, WH), shade(L.wall, 0.9));
    quad(g, planeX(-0.5, -0.5, h - 0.5, 0, 6), shade(L.wall, 0.75));
    quad(g, planeY(-0.5, -0.5, w - 0.5, 0, 6), shade(L.wall, 0.68));

    const win = (plane, at) => {
      quad(g, plane(at - 0.42, at + 0.42, WH * 0.3, WH * 0.84), 0xffffff);
      quad(g, plane(at - 0.36, at + 0.36, WH * 0.35, WH * 0.79), 0xbfe3ff);
      quad(g, plane(at - 0.36, at - 0.1, WH * 0.6, WH * 0.79), 0xdff1ff);
      quad(g, plane(at - 0.02, at + 0.02, WH * 0.35, WH * 0.79), 0xffffff);
    };
    const planeL = (a1, a2, z1, z2) => planeX(-0.49, a1, a2, z1, z2);
    const planeR = (a1, a2, z1, z2) => planeY(-0.49, a1, a2, z1, z2);
    L.winL.forEach(y => win(planeL, y));
    L.winR.forEach(x => win(planeR, x));
    for (const it of L.items) if (it.wall) WALL_ITEMS[it.k](g, it.wall === 'L' ? planeL : planeR, it.at, it);

    const cap = shade(L.wall, 1.06);
    quad(g, [P(-0.5, -0.5, WH), P(-0.5, h - 0.5, WH), P(-0.5 - T, h - 0.5, WH), P(-0.5 - T, -0.5 - T, WH)], cap);
    quad(g, [P(-0.5, -0.5, WH), P(w - 0.5, -0.5, WH), P(w - 0.5, -0.5 - T, WH), P(-0.5 - T, -0.5 - T, WH)], cap);
    quad(g, planeY(h - 0.5, -0.5 - T, -0.5, 0, WH), shade(L.wall, 0.8));
    quad(g, planeX(w - 0.5, -0.5 - T, -0.5, 0, WH), shade(L.wall, 0.7));
  }

  wallSeg(ex, ey, alongY, color, hgt) {
    const g = this.w(this.add.graphics().setDepth(depthAt(ex, ey) + 6));
    const col = { top: shade(color, 1.25), left: color, right: shade(color, 0.8) };
    if (alongY) block(g, ex, ey, 0.12, 1.06, hgt, col);
    else block(g, ex, ey, 1.06, 0.12, hgt, col);
  }

  drawPartitions() {
    const L = this.L, { w, h } = L;
    const isDoor = (z, x, y) => (z.doors || []).some(([dx, dy]) => dx === x && dy === y);
    const edges = new Set();
    for (const z of L.zones) {
      if (z.walls === false) continue;
      for (let y = z.y; y < z.y + z.h; y++) {
        for (let x = z.x; x < z.x + z.w; x++) {
          if (isDoor(z, x, y)) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (nx >= z.x && nx < z.x + z.w && ny >= z.y && ny < z.y + z.h) continue;
            const nz = this.zoneAt(nx, ny);
            if (nz >= 0 && isDoor(L.zones[nz], nx, ny)) continue;
            const ex = x + dx / 2, ey = y + dy / 2, key = `${ex},${ey}`;
            if (edges.has(key)) continue;
            edges.add(key);
            this.wallSeg(ex, ey, dx !== 0, z.wall, 20);
          }
        }
      }
    }
    // Murets de façade (bord avant), sauf la porte d'entrée
    const frontCol = (x, y) => {
      const zi = this.zoneAt(x, y);
      return zi >= 0 && L.zones[zi].walls !== false ? L.zones[zi].wall : shade(L.wall, 0.78);
    };
    const isEntrance = (x, y) => L.entrance && L.entrance.x === x && L.entrance.y === y;
    for (let x = 0; x < w; x++) if (!isEntrance(x, h - 1)) this.wallSeg(x, h - 0.5, false, frontCol(x, h - 1), 16);
    for (let y = 0; y < h; y++) if (!isEntrance(w - 1, y)) this.wallSeg(w - 0.5, y, true, frontCol(w - 1, y), 16);
  }

  // ---------- Étiquettes (nettes) ----------
  makePill(x, y, icon, title, sub, color, centered = false) {
    const c = this.u(this.add.container(x, y).setDepth(TOP));
    this.objs.push(c);
    const bg = this.add.graphics();
    const ic = this.add.text(0, 0, icon, { fontFamily: EMOJI_FONT, fontSize: '14px' }).setOrigin(0, 0.5).setResolution(4);
    const tt = this.add.text(0, 0, title, { fontFamily: 'system-ui,sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' }).setResolution(4);
    const st = sub == null ? null : this.add.text(0, 0, sub, { fontFamily: 'system-ui,sans-serif', fontSize: '8px', color: '#ffffff' }).setResolution(4).setAlpha(0.9);
    c.add([bg, ic, tt, ...(st ? [st] : [])]);
    const pill = { c, bg, ic, tt, st, color, centered };
    this.layoutPill(pill);
    this.pills.push(pill);
    return pill;
  }

  layoutPill(p) {
    const pad = 7, h = p.st ? 28 : 22;
    const textW = Math.max(p.tt.width, p.st ? p.st.width : 0);
    const w = pad + 18 + textW + pad + 2;
    const x0 = p.centered ? -w / 2 : 0;
    p.bg.clear();
    p.bg.fillStyle(0x000000, 0.12); p.bg.fillRoundedRect(x0 + 1, -h / 2 + 2, w, h, 9);
    p.bg.fillStyle(p.color, 0.95); p.bg.fillRoundedRect(x0, -h / 2, w, h, 9);
    p.bg.lineStyle(1.5, 0xffffff, 0.7); p.bg.strokeRoundedRect(x0, -h / 2, w, h, 9);
    p.ic.setPosition(x0 + pad, 0);
    p.tt.setPosition(x0 + pad + 18, p.st ? -12 : -7);
    if (p.st) p.st.setPosition(x0 + pad + 18, 2);
  }

  makeZoneLabel(z) {
    const s = P(z.x - 0.35, z.y + z.h - 0.55, 6);
    return { z, pill: this.makePill(s.x, s.y, z.icon, t(z.label), z.note ? t(z.note) : ' ', z.wall) };
  }

  makeTag() {
    const c = this.u(this.add.container(0, 0).setDepth(TOP - 1));
    const bg = this.add.graphics();
    const n = this.add.text(0, 0, '', { fontFamily: 'system-ui,sans-serif', fontSize: '9px', color: '#8a83a3' }).setResolution(4);
    const t = this.add.text(0, 0, '', { fontFamily: `ui-monospace,Consolas,monospace,${EMOJI_FONT}`, fontSize: '9px', color: '#3d3357' }).setResolution(4);
    c.add([bg, n, t]);
    return { c, bg, n, t };
  }

  setTag(tag, name, act) {
    tag.n.setText(name); tag.t.setText(act);
    const pad = 5, gap = 4, h = 15;
    const w = pad + tag.n.width + gap + tag.t.width + pad;
    tag.bg.clear();
    tag.bg.fillStyle(0xffffff, 0.93); tag.bg.fillRoundedRect(-w / 2, -h, w, h, 7);
    tag.n.setPosition(-w / 2 + pad, -h + 2);
    tag.t.setPosition(-w / 2 + pad + tag.n.width + gap, -h + 2);
  }

  // ---------- Personnages ----------
  viewFor(a) {
    let v = this.views.get(a.id);
    if (!v) {
      const spr = this.add.image(0, 0, ensureCharTexture(this, a)).setOrigin(0.5, 0.93).setScale(1.8);
      this.worldLayer.add(spr);
      v = { spr, tag: this.makeTag(), floor: 0 };
      if (a.isPlayer) {
        v.ring = this.add.image(0, 0, 'ring').setScale(1.2);
        this.worldLayer.add(v.ring);
        this.tweens.add({ targets: v.ring, scale: 1.5, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      this.views.set(a.id, v);
    }
    return v;
  }

  placeActors() {
    const b = this.building;
    const inside = state.world.actors.filter(a => a.inside === b.id);
    // « Cuisiner » se fait en deux temps : aux fourneaux, puis à table
    const cooking = a => a.current && a.current.id === 'eat_home' && a.current.remaining > a.current.total * 0.45;
    const sig = inside.map(a => `${a.id}:${a.current ? a.current.id : ''}:${cooking(a) ? 'c' : ''}:${a.texKey}:${a.name}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.clearProps();

    for (const [id, v] of this.views) {
      if (!inside.some(a => a.id === id)) { v.spr.destroy(); v.tag.c.destroy(); if (v.ring) v.ring.destroy(); this.views.delete(id); }
    }
    inside.sort((a, c) => (c.isPlayer - a.isPlayer) || (a.id < c.id ? -1 : 1));

    const used = new Set();
    this.assigned = [];
    let k = 0;
    for (const a of inside) {
      let act = a.current ? a.current.id : 'stay';
      if (cooking(a)) act = 'cook';
      const slot = act === 'overtime' ? 'work' : act;
      const st = this.stations.find(s => !used.has(s) && s.a.includes(slot))
        || this.stations.find(s => !used.has(s) && s.a.includes('any'));
      let pos;
      if (st) { used.add(st); pos = st; this.assigned.push(st); }
      else {
        const list = this.free[this.free.length > 1 && this.free[1].length ? 1 : 0];
        pos = list[(hash(a.id) + k++) % list.length];
      }

      const v = this.viewFor(a);
      const pose = poseFor(act, st);
      const lie = pose === 'lie';
      v.lie = lie;
      v.floor = pos.floor;
      v.act = act;
      v.pos = pos;
      // Animation : deux images qui alternent (fourchette, tasse, poêle, clavier)
      v.anim = ANIM[pose] ? ANIM[pose].map(n => ensurePose(this, a, n)) : null;
      const tex = v.anim ? v.anim[0] : ensurePose(this, a, lie ? 'stand' : pose);
      const angle = lie ? (st && st.lieAngle != null ? st.lieAngle : 63) : 0;
      v.spr.setTexture(tex)
        .setOrigin(0.5, lie ? 0.5 : 0.93).setScale(lie ? 1.5 : 1.8).setAngle(angle)
        .setPosition(pos.sx, pos.sy - (lie ? 14 : 0))
        .setDepth(pos.depth)
        .setFlipX(!!(st && st.face < 0));

      // Accessoires de scène : assiette sur la table, Zzz, vapeur, télé
      if (pos.floor === this.floorIdx) {
        if ((pose === 'eat' || pose === 'drink') && st && st.table) this.addPlate(st.table[0], st.table[1], pose === 'drink');
        if (lie && (act === 'sleep' || act === 'nap' || act === 'sleep_rough')) this.fx.zzz.push(v);
        if (pose === 'cook' && act === 'cook') this.fx.steam.push({ x: pos.x - 1, y: pos.y });
        if (act === 'watch_tv') this.fx.tv = true;
      }
      // (« cook » n'est qu'une phase de « Cuisiner » : on prend l'action réelle pour l'étiquette)
      const def = ACTIONS[act] || ACTIONS[a.current ? a.current.id : 'stay'] || ACTIONS.stay;
      const label = lie ? '💤 dort' : act === 'stay' ? '🙂 flâne' : `${def.icon} ${def.label.toLowerCase()}`;
      this.setTag(v.tag, a.name, label);
      v.tag.c.setPosition(pos.sx, pos.sy - (lie ? 30 : 56));
      if (v.ring) v.ring.setPosition(pos.sx, pos.sy + 1).setDepth(pos.depth - 0.2);

      // Le joueur change d'étage (ascenseur) : la vue le suit
      if (a.isPlayer && pos.floor !== this.playerFloor) {
        this.playerFloor = pos.floor;
        if (pos.floor !== this.floorIdx) this.setFloor(pos.floor);
        else this.renderFloorButtons();
      }
    }
    this.applyVisibility();
    this.updateZoneCounts();
  }

  // ---------- Accessoires et effets façon Sims ----------
  clearProps() {
    (this.props || []).forEach(o => o.destroy());
    this.props = [];
    this.fx = { zzz: [], steam: [], tv: false };
  }

  addPlate(x, y, cup) {
    const s = toScreen(x, y);
    const g = this.add.graphics().setDepth(depthAt(x, y) + 3.6);
    this.worldLayer.add(g);
    const top = s.y - 12; // sur le plateau de la table
    if (cup) {
      g.fillStyle(0xffffff); g.fillRect(s.x - 3, top - 5, 6, 5);
      g.fillStyle(0x6b4226); g.fillRect(s.x - 2, top - 5, 4, 1);
    } else {
      g.fillStyle(0xffffff); g.fillEllipse(s.x, top, 14, 6);
      g.fillStyle(0xf08a3c); g.fillCircle(s.x - 2, top - 1, 2);
      g.fillStyle(0x4caf50); g.fillCircle(s.x + 2, top - 1, 1.8);
    }
    this.props.push(g);
  }

  // Écran de télé allumé (les couleurs changent comme un film)
  tvScreen(on) {
    const tvItem = on && this.L ? this.L.items.find(it => it.k === 'tv') : null;
    if (!tvItem) { if (this.tvGlow) { this.tvGlow.destroy(); this.tvGlow = null; } return; }
    if (!this.tvGlow) { this.tvGlow = this.add.graphics().setDepth(1.2); this.worldLayer.add(this.tvGlow); }
    const at = tvItem.at;
    const cols = [0x6fc3ff, 0xbfe7ff, 0x5b8def, 0xf2c94c, 0x9fe3c2, 0xe86a8c];
    const g = this.tvGlow;
    g.clear();
    quad(g, planeY(-0.47, at - 0.4, at + 0.4, 26, 48), cols[Math.floor(Math.random() * cols.length)]);
    quad(g, planeY(-0.465, at - 0.25, at + 0.1, 32, 42), cols[Math.floor(Math.random() * cols.length)], 0.8);
    g.fillStyle(0xbfe7ff, 0.12); g.fillPoints(planeY(-0.4, at - 0.9, at + 0.9, 0, 4), true); // reflet au sol
  }

  updateFx(time, delta) {
    if (!this.fx) return;
    this.fxClock = (this.fxClock || 0) + delta;
    // Animations des personnages (2 images)
    const frame = Math.floor(time / 380) % 2;
    for (const v of this.views.values()) if (v.anim && v.spr.texture.key !== v.anim[frame]) v.spr.setTexture(v.anim[frame]);
    if (this.fxClock < 260) return;
    this.fxClock = 0;
    this.tvScreen(this.fx.tv);
    // Vapeur au-dessus de la poêle
    for (const s of this.fx.steam) {
      const p = toScreen(s.x, s.y);
      const puff = this.add.circle(p.x + (Math.random() - 0.5) * 10, p.y - 22, 3 + Math.random() * 2, 0xffffff, 0.7).setDepth(TOP - 10);
      this.worldLayer.add(puff);
      this.tweens.add({ targets: puff, y: puff.y - 26, alpha: 0, scale: 2.2, duration: 1300, onComplete: () => puff.destroy() });
    }
    // Zzz au-dessus des dormeurs
    if (Math.random() < 0.45) {
      for (const v of this.fx.zzz) {
        if (v.floor !== this.floorIdx) continue;
        const z = this.add.text(v.spr.x + 6, v.spr.y - 18, 'z', { fontFamily: 'system-ui,sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#7b5cf0', stroke: '#ffffff', strokeThickness: 3 }).setResolution(4).setDepth(TOP - 5);
        this.uiLayer.add(z);
        this.tweens.add({ targets: z, x: z.x + 12, y: z.y - 22, alpha: 0, scale: 1.6, duration: 1800, onComplete: () => z.destroy() });
      }
    }
  }

  applyVisibility() {
    for (const v of this.views.values()) {
      const vis = v.floor === this.floorIdx;
      v.spr.setVisible(vis);
      v.tag.c.setVisible(false); // pas de noms au-dessus des têtes (la fiche s'ouvre en touchant la personne)
      if (v.ring) v.ring.setVisible(vis);
    }
  }

  updateZoneCounts() {
    if (!this.zoneLabels) return;
    for (const { z, pill, i } of this.zoneLabels) {
      if (z.note) continue;
      const mine = this.stations.filter(s => s.floor === this.floorIdx && s.zone === i);
      const n = (this.assigned || []).filter(s => s.floor === this.floorIdx && s.zone === i).length;
      pill.st.setText(mine.length ? `${n}/${mine.length} ${t(z.sub || 'présents')}` : t(`${n} ici`));
      this.layoutPill(pill);
    }
  }

  // ---------- Caméra ----------
  fit() {
    const L = this.L, cam = this.cameras.main;
    const below = this.floorIdx === 0 ? 46 : 20 + this.floorIdx * LEVEL_H + 22;
    const b = {
      minX: P(-0.5, L.h - 0.5).x - 30, maxX: P(L.w - 0.5, -0.5).x + 30,
      minY: P(-0.5, -0.5, L.wallH).y - 40, maxY: P(L.w - 0.5, L.h - 0.5).y + below,
    };
    this.bounds = b;
    // La pièce se place dans l'espace libre de l'écran : à droite de la colonne de gauche, sous la barre du haut
    // (et la carte d'objectif), à gauche de la fenêtre du bas — rien ne la recouvre
    const d = state.dpr || 1; // les marges de l'interface sont en pixels CSS
    const rect = id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') ? e.getBoundingClientRect() : null; };
    const W = cam.width / d, H = cam.height / d;
    const dock = rect('dock'), box = rect('box'), hud = rect('hud'), quest = rect('quest');
    // (la barre « ma vie » est en bas à gauche : la pièce reste au-dessus ; les étages sont à gauche)
    const floors = rect('floors');
    let left = (floors && floors.width ? floors.right : 0) + 10, right = W - 52, top = Math.max(hud ? hud.bottom : 40, quest && quest.height ? quest.bottom : 0) + 6;
    let bottom = (dock && dock.top > H / 2 ? dock.top : H) - 8;
    // Deux placements possibles : à gauche de la fenêtre du bas, ou au-dessus d'elle (toute la largeur) ;
    // on garde celui qui montre la pièce le plus grand (la petite fiche des commerces libère beaucoup de place)
    const zOf = (l, r, t2, bt) => Math.min((r - l) * d / (b.maxX - b.minX), (bt - t2) * d / (b.maxY - b.minY));
    let best = null;
    const tryFit = (l, r, t2, bt) => { if (r - l < 200 || bt - t2 < 150) return; const z = zOf(l, r, t2, bt); if (!best || z > best.z) best = { z, l, r, t: t2, bt }; };
    if (box && box.width) {
      tryFit(left, box.left - 10, top, bottom);           // à gauche de la fenêtre
      tryFit(left, right, top, Math.min(bottom, box.top - 8)); // au-dessus de la fenêtre
    } else tryFit(left, right, top, bottom);
    if (!best) best = { z: zOf(10, W - 52, Math.max(10, bottom - 150), bottom), l: 10, r: W - 52, t: Math.max(10, bottom - 150), bt: bottom };
    left = best.l; right = best.r; top = best.t; bottom = best.bt;
    const z = best.z;
    this.minZoom = z * 0.7;
    this.maxZoom = Math.max(z * 3, 2.5 * d);
    cam.setZoom(z);
    const fx = (left + right) / 2 * d, fy = (top + bottom) / 2 * d;
    cam.centerOn((b.minX + b.maxX) / 2 + (cam.width / 2 - fx) / z, (b.minY + b.maxY) / 2 + (cam.height / 2 - fy) / z);
  }

  // Recadrer peu après un changement de l'interface (fenêtre ouverte, carte réduite…)
  fitSoon() {
    clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => { if (this.building && this.L) this.fit(); }, 120);
  }

  setZoom(z) { this.cameras.main.setZoom(Phaser.Math.Clamp(z, this.minZoom, this.maxZoom)); }

  clampCamera() {
    const cam = this.cameras.main, b = this.bounds;
    const slackX = cam.width / 2 / cam.zoom, slackY = cam.height / 2 / cam.zoom;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, b.minX - slackX * 0.5, b.maxX + slackX * 0.8);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, b.minY - slackY * 0.3, b.maxY + slackY * 0.3);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }

  // ---------- Toucher un meuble ou une personne ----------
  tap(p) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // Sortir : toucher l'étiquette « Sortir » ou la case de la porte
    const L = this.L;
    if (L && L.entrance) {
      const ep = this.exitPill && this.exitPill.c;
      const onPill = ep && Math.abs(wp.x - ep.x) < 34 && Math.abs(wp.y - ep.y) < 16;
      const t0 = toTile(wp.x, wp.y);
      const onDoor = t0.x === L.entrance.x && (t0.y === L.entrance.y || t0.y === L.entrance.y + 1);
      if (onPill || onDoor) { state.world.perform(state.player, 'leave'); return; }
    }
    for (const [id, v] of this.views) {
      if (id === state.player.id || v.floor !== this.floorIdx) continue;
      const h = v.lie ? 20 : 54;
      if (Math.abs(wp.x - v.spr.x) < 16 && wp.y > v.spr.y - h && wp.y < v.spr.y + 6) {
        return state.ui.showPerson(state.world.actorById(id));
      }
    }
    for (const off of [0, 12, 24]) {
      const t = toTile(wp.x, wp.y + off);
      const it = this.itemAt.get(`${t.x},${t.y}`);
      const st = this.stations.find(s => s.floor === this.floorIdx && s.x === t.x && s.y === t.y);
      // Meuble à plusieurs usages : petit menu dans la fenêtre
      if (it && it.actions && it.actions.length > 1) {
        return state.ui.showObject({ name: it.name || 'Objet', icon: '✨', actions: it.actions, building: this.building });
      }
      const action = (it && (it.action || (it.actions && it.actions[0]))) || (st && st.a.find(a => a !== 'any'));
      if (action) return this.tryAction(action);
      if (it && it.k === 'stairs_up') return this.setFloor((this.floorIdx + 1) % this.floors.length);
      // Tout le reste est aussi touchable : regarder, s'asseoir, arroser, un en-cas…
      if (it) return state.ui.showObject({ name: it.name || ITEM_NAMES[it.k] || 'Objet', icon: '✨', actions: genericActions(it.k), params: { what: it.k }, building: this.building });
    }
  }

  tryAction(id) {
    const w = state.world, p = state.player;
    if (id === 'shop') return this.floatText(t('🛍️ Les articles sont dans la fenêtre à droite'), '#7b5cf0');
    if (!w.canDoAt(p, id, this.building)) {
      return this.floatText(t(id === 'work' ? 'Tu ne travailles pas ici' : 'Pas possible ici'), '#e2475b');
    }
    if (p.doing === id) return;
    w.perform(p, id);
  }

  // ---------- Retours visuels ----------
  floatDelta(e) {
    const d = e.delta, parts = [];
    if (Math.abs(d.money) >= 0.5) parts.push(`${d.money > 0 ? '+' : ''}${Math.round(d.money * 10) / 10} €`);
    if (Math.abs(d.energy) >= 1) parts.push(`⚡${d.energy > 0 ? '+' : ''}${Math.round(d.energy)}`);
    if (Math.abs(d.hunger) >= 1) parts.push(`🍔${d.hunger < 0 ? '+' : ''}${Math.round(-d.hunger)}`);
    if (d.mood && Math.abs(d.mood) >= 1) parts.push(`😊${d.mood > 0 ? '+' : ''}${Math.round(d.mood)}`);
    if (e.msg) parts.push(t(e.msg));
    if (parts.length) this.floatText(parts.join('  '), d.money < 0 ? '#3d3357' : '#2e8b57');
  }

  floatText(str, color) {
    const v = this.views.get(state.player.id);
    const vis = v && v.floor === this.floorIdx;
    const x = vis ? v.spr.x : this.cameras.main.midPoint.x;
    const y = vis ? v.tag.c.y - 30 : this.cameras.main.midPoint.y;
    const t = this.u(this.add.text(x, y, str, {
      fontFamily: `system-ui,${EMOJI_FONT}`, fontSize: '13px', fontStyle: 'bold', color,
      stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(TOP + 10).setResolution(4));
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, delay: 900, duration: 1300, onComplete: () => t.destroy() });
  }
}
