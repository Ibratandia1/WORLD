// Chef d'orchestre du jeu (sans moteur 2D) : fait avancer le monde à chaque image de la vue 3D,
// ouvre / ferme les intérieurs, gère les touchers sur les objets de la rue et les retours visuels.
import { t } from '../i18n.js';
import { state } from '../state.js';
import { streetSpots, FestSpots } from '../city/common.js';
import { festById } from '../sim/festivals.js';
import { InteriorLogic } from './interior.js';

export class GameController {
  constructor(world) {
    this.world = world;
    this.map = world.map;
    state.scene = this;
    this.spots = streetSpots(this.map);
    this.fest = new FestSpots(world);
    if (world.festivals) for (const id of world.festivals.active) this.fest.show(festById(id));
    this.interior = state.interior = new InteriorLogic(world);
    this.shownInterior = null;
    this.tlTick = 0;
    this.listen();
  }

  // Une image : le monde avance (ms réelles), puis l'intérieur et l'interface suivent
  update(ms) {
    const delta = Math.min(ms, 250); // (onglet en arrière-plan : pas de grand saut)
    this.world.update(delta);
    if ((this.tlTick += delta) > 200) {
      this.tlTick = 0;
      // Le joueur attend au feu rouge : on le lui dit (une fois par attente)
      const pw = state.player && state.player.waitLight;
      if (pw && !this.saidWait) this.floatText(t('🚦 Feu rouge : on attend pour traverser'), '#e2475b');
      this.saidWait = pw;
    }
    this.syncInterior();
    this.interior.update();
    state.ui.update(delta);
  }

  // Quand le joueur est dans un lieu, la vue passe à son intérieur
  syncInterior() {
    const inside = state.player.inside;
    const b = inside != null ? this.map.buildings[inside] : null;
    if (b === this.shownInterior) return;
    this.shownInterior = b;
    if (b) this.interior.show(b); else this.interior.hide();
    document.body.classList.toggle('indoors', !!b);
    if (!b) this.centerOnPlayer();
  }

  // ---------- Toucher une case de la ville (venu de la vue 3D) ----------
  tapTile(x, y, tile) {
    const at = (s, r = 0.6) => Math.abs(s.x - x) <= r && Math.abs(s.y - y) <= r;
    const fs = this.fest.spots.find(s => at(s, 0.8));
    if (fs) return this.useSpot(fs, fs.actions);
    const st = this.spots.statues.find(s => at(s));
    if (st) return this.useSpot(st, ['admire_statue']);
    const f = this.spots.fountains.find(s => at(s));
    if (f) return this.useSpot(f, ['wish_fountain']);
    const bench = this.spots.benches.find(s => at(s, 0.5));
    if (bench) return this.useSpot(bench, ['sit_bench', 'feed_pigeons']);
    const bin = this.spots.bins.find(s => at(s, 0.5));
    if (bin) return this.useSpot(bin, ['use_bin', 'pick_litter']);
    if (tile.deco === 'filler') return this.floatText(t('🏢 Immeuble d’habitation privé'), '#7a6f96');
    if (!tile.walk) return;
    this.world.perform(state.player, 'goto', { x, y });
  }

  // Objet de la rue : on s'en approche si besoin, puis le geste se fait directement (sans menu)
  useSpot(spot, actions) {
    const w = this.world, p = state.player;
    const far = Math.abs(spot.x - p.px) + Math.abs(spot.y - p.py) > 1.6;
    if (far) {
      const tgt = this.map.nearestWalkable(spot.x, spot.y);
      p.afterGoto = { actions, spot }; // le geste se fera à l'arrivée
      return w.perform(p, 'goto', { x: tgt.x, y: tgt.y });
    }
    for (const id of actions) if (w.check(p, id, {}) === true) return w.perform(p, id, {});
    const r = w.check(p, actions[0], {});
    this.floatText(t(typeof r === 'string' ? r : 'Pas possible ici'), '#e2475b');
  }

  // ---------- Retours visuels ----------
  listen() {
    const isMe = e => e.actor === state.player;
    this.world.on('done', e => { if (isMe(e)) this.floatDelta(e); });
    this.world.on('fail', e => { if (isMe(e)) this.floatText(t(e.reason), '#e2475b'); });
    // Objet de la rue touché de loin : le geste se fait à l'arrivée (annulé si on fait autre chose entre-temps)
    this.world.on('arrive', e => {
      const p = state.player;
      if (e.actor !== p || !p.afterGoto) return;
      const q = p.afterGoto; p.afterGoto = null;
      this.useSpot(q.spot, q.actions);
    });
    this.world.on('plan', e => { if (e.actor === state.player && e.id !== 'goto') state.player.afterGoto = null; });
  }

  floatDelta(e) {
    const d = e.delta, parts = [];
    if (Math.abs(d.money) >= 0.5) parts.push(`${d.money > 0 ? '+' : ''}${Math.round(d.money * 10) / 10} €`);
    if (Math.abs(d.energy) >= 1) parts.push(`⚡${d.energy > 0 ? '+' : ''}${Math.round(d.energy)}`);
    if (Math.abs(d.hunger) >= 1) parts.push(`🍔${d.hunger < 0 ? '+' : ''}${Math.round(-d.hunger)}`);
    if (d.mood && Math.abs(d.mood) >= 1) parts.push(`😊${d.mood > 0 ? '+' : ''}${Math.round(d.mood)}`);
    if (e.msg) parts.push(t(e.msg));
    if (parts.length) this.floatText(parts.join('  '), d.money < 0 ? '#3d3357' : '#2e8b57');
  }

  floatText(str, color) { if (state.city3d) state.city3d.floatText(str, color); }
  centerOnPlayer() { if (state.city3d) state.city3d.centerOnPlayer(); }
  focusBuilding(b) { if (state.city3d) state.city3d.focusBuilding(b); }
  focusActor(a) { if (state.city3d) state.city3d.focusActor(a); }
  applySaver() {} // (la 3D lit le réglage elle-même)
}
