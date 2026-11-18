// Logique des intérieurs (sans aucun dessin) : étages, places des habitants selon leur activité, meubles touchables.
// Le dessin est fait en 3D par src/interior3d.js à partir de ctx3d().
import { LAYOUTS, floorsOf } from '../interiors/layouts.js';
import { ACTIONS } from '../sim/actions.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { furnishedFloors, ensurePlaced } from '../sim/furniture.js';

// Noms des meubles et usages par défaut (quand le plan ne leur donne pas d'action)
export const ITEM_NAMES = {
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
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class InteriorLogic {
  constructor(world) {
    this.world = world;
    this.building = null;
    this.views = new Map();   // id de l'habitant -> { pos, act, lie, floor }
    this.sig = '';
    this.rev = 0;
    // Un meuble acheté ou revendu chez toi : la pièce se redessine aussitôt
    world.on('furnished', e => { if (this.building && e.actor === state.player && this.building.id === state.player.home) this.reload(); });
    this.floorsEl = document.getElementById('floors');
    this.floorsEl.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) this.setFloor(Number(b.dataset.floor));
    });
  }

  // ---------- Ouverture / fermeture ----------
  show(b) {
    this.building = b;
    this.floors = this.floorsFor(b);
    this.views.clear();
    this.sig = '';
    this.prepareStations();
    this.floorIdx = 0;
    this.playerFloor = null;
    this.buildFloor();
  }

  // Plan du lieu ; chez toi, avec tes meubles
  floorsFor(b) {
    const base = floorsOf(LAYOUTS[b.style && LAYOUTS[b.style] ? b.style : b.type]);
    const p = state.player;
    if (!p || b.id !== p.home) return base;
    ensurePlaced(p, this.world);
    return furnishedFloors(base, p);
  }

  // Redessine la pièce en gardant l'étage affiché
  reload() {
    const fi = this.floorIdx;
    this.floors = this.floorsFor(this.building);
    this.prepareStations();
    this.floorIdx = Math.min(fi, this.floors.length - 1);
    this.sig = '';
    this.rev++;
    this.buildFloor();
  }

  hide() {
    this.building = null;
    this.L = null;
    this.views.clear();
    this.sig = '';
    this.renderFloorButtons();
  }

  fitSoon() {} // (la vue 3D se cadre toute seule)

  // Places de tous les étages, et cases libres de chaque étage
  prepareStations() {
    const zoneOf = (F, x, y) => F.zones.findIndex(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    this.stations = [];
    this.free = [];
    this.floors.forEach((F, fi) => {
      for (const s of F.stations) this.stations.push({ ...s, floor: fi, zone: zoneOf(F, s.x, s.y) });
      const taken = new Set([
        ...F.items.filter(it => !it.wall && !it.flat).map(it => `${it.x},${it.y}`),
        ...F.stations.map(s => `${s.x},${s.y}`),
        ...(F.entrance ? [`${F.entrance.x},${F.entrance.y}`] : []),
      ]);
      const list = [];
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (!taken.has(`${x},${y}`)) list.push({ x, y, floor: fi });
      this.free.push(list);
    });
    this.stations.sort((a, b) => (b.prio || 0) - (a.prio || 0)); // tri stable
  }

  setFloor(i) {
    if (!this.building || i === this.floorIdx || i < 0 || i >= this.floors.length) return;
    this.floorIdx = i;
    this.sig = '';
    this.buildFloor();
  }

  // Étage affiché : meubles touchables par case
  buildFloor() {
    const L = this.L = this.floors[this.floorIdx];
    this.itemAt = new Map();
    for (const it of L.items) {
      if (it.wall) continue;
      const key = `${it.x},${it.y}`;
      const prev = this.itemAt.get(key);
      if (!prev || (!prev.action && it.action)) this.itemAt.set(key, it);
    }
    this.renderFloorButtons();
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

  // ---------- Qui est où (appelé à chaque image tant qu'on est dans le lieu) ----------
  update() {
    if (!this.building) return;
    const b = this.building, w = this.world;
    const inside = w.actors.filter(a => a.inside === b.id);
    // « Cuisiner » se fait en deux temps : aux fourneaux, puis à table
    const cooking = a => a.current && a.current.id === 'eat_home' && a.current.remaining > a.current.total * 0.45;
    const sig = inside.map(a => `${a.id}:${a.current ? a.current.id : ''}:${cooking(a) ? 'c' : ''}:${a.texKey}:${a.name}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    for (const id of [...this.views.keys()]) if (!inside.some(a => a.id === id)) this.views.delete(id);
    inside.sort((a, c) => (c.isPlayer - a.isPlayer) || (a.id < c.id ? -1 : 1));
    const used = new Set();
    let k = 0;
    for (const a of inside) {
      let act = a.current ? a.current.id : 'stay';
      if (cooking(a)) act = 'cook';
      const slot = act === 'overtime' ? 'work' : act;
      const st = this.stations.find(s => !used.has(s) && s.a.includes(slot))
        || this.stations.find(s => !used.has(s) && s.a.includes('any'));
      let pos;
      if (st) { used.add(st); pos = st; } else {
        const list = this.free[this.free.length > 1 && this.free[1].length ? 1 : 0];
        pos = list[(hash(a.id) + k++) % list.length];
      }
      const lie = !!((st && st.lie) || act === 'nap');
      this.views.set(a.id, { pos, act, lie, floor: pos.floor });
      // Le joueur change d'étage (ascenseur) : la vue le suit
      if (a.isPlayer && pos.floor !== this.playerFloor) {
        this.playerFloor = pos.floor;
        if (pos.floor !== this.floorIdx) { this.floorIdx = pos.floor; this.buildFloor(); } else this.renderFloorButtons();
      }
    }
  }

  // Ce que la vue 3D doit dessiner
  ctx3d() {
    if (!this.building || !this.L) return null;
    const b = this.building, L = this.L;
    return { building: b, L, floorIdx: this.floorIdx, rev: this.rev, views: this.views, playerId: state.player.id,
      title: this.floors.length > 1 ? `${b.name} · ${t(L.name)}` : b.name };
  }

  // ---------- Toucher (venu de la vue 3D) : une case de la pièce, ou une personne ----------
  tapTile3d(tx, ty, actorId) {
    const w = this.world, p = state.player, L = this.L;
    if (!this.building || !L) return;
    if (actorId) { if (actorId !== p.id) state.ui.showPerson(w.actorById(actorId)); return; }
    if (L.entrance && tx === L.entrance.x && (ty === L.entrance.y || ty === L.entrance.y + 1)) { w.perform(p, 'leave'); return; }
    const it = this.itemAt.get(`${tx},${ty}`);
    const st = this.stations.find(s => s.floor === this.floorIdx && s.x === tx && s.y === ty);
    if (it || st) return this.useItem(it, st);
    // un endroit vide de la pièce : la fiche du lieu revient (si on l'avait fermée)
    if (state.ui.stayHidden != null) { state.ui.stayHidden = null; state.ui.render(true); }
  }

  // Toucher un meuble : on agit tout de suite (la première action possible), sans passer par un menu.
  // Rayons et portants d'une boutique : le catalogue s'ouvre dans la fiche.
  useItem(it, st) {
    const w = this.world, p = state.player, b = this.building;
    if (it && it.k === 'stairs_up') return this.setFloor((this.floorIdx + 1) % this.floors.length);
    const own = [...(it && it.actions ? it.actions : []), ...(it && it.action ? [it.action] : []), ...(st ? st.a.filter(a => a !== 'any') : [])];
    if (own.includes('shop')) { state.ui.stayHidden = null; state.ui.placeMore = true; return state.ui.render(true); }
    const cand = own.length ? own : (it ? genericActions(it.k) : []);
    const paramsOf = id => (own.length ? (ACTIONS[id] && ACTIONS[id].place && ACTIONS[id].place.type ? { at: b.id } : {}) : { what: it.k });
    const ok = id => ACTIONS[id] && (ACTIONS[id].place ? w.canDoAt(p, id, b) : w.check(p, id, paramsOf(id)) === true);
    for (const id of cand) {
      if (!ok(id)) continue;
      if (p.doing === id) return;
      return w.perform(p, id, paramsOf(id));
    }
    const id = cand[0];
    if (!id) return;
    const r = w.check(p, id, paramsOf(id));
    if (state.city3d) state.city3d.floatText(t(typeof r === 'string' ? r : id === 'work' ? 'Tu ne travailles pas ici' : 'Pas possible ici'), '#e2475b');
  }
}
