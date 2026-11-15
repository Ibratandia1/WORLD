import { Emitter } from './emitter.js';
import { ACTIONS } from './actions.js';
import { findPath } from './pathfinding.js';
import { decide } from './ai.js';
import { reviewDay, weekdayOf, DAY_SHORT, shiftNow, shiftOf, todayLog, sellerAt, incomeTax, taxRate, PROPERTY_TAX } from './jobs.js';
import { vehicleOf, itemById } from './catalog.js';
import { newDayHousing } from './housing.js';
import { chatterLine } from './social.js';

export const MIN_PER_SEC = 1;    // minutes de jeu par seconde réelle (vitesse x1) : une journée ≈ 24 min
const WALK = 1.6;                // cases parcourues par minute de jeu
const DEFAULT_SKIP = 10;         // accélération quand le joueur est occupé (sauf si l'action en précise une)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Le monde : temps, météo, acteurs. Aucune dépendance à Phaser.
// Événements émis : plan, start, done, cancel, arrive, fail, weather, newDay, event, eventClosed,
// jobWarning, fired, raise, hired, rentBill, rentReminder, evicted
export class World extends Emitter {
  constructor(map) {
    super();
    this.map = map;
    this.minutes = 7 * 60;      // Jour 1 (lundi), 07:00
    this.speed = 1;
    this.paused = false;
    this.fast = false;
    this.weather = 'sun';
    this.weatherIn = 240;
    this.actors = [];
    this.directors = [];
  }

  get day() { return Math.floor(this.minutes / 1440) + 1; }
  get hour() { return (this.minutes % 1440) / 60; }
  get weekday() { return weekdayOf(this.day); }
  get dayShort() { return DAY_SHORT[this.weekday]; }
  get clock() {
    const m = Math.floor(this.minutes % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  get isNight() { const h = this.hour; return h < 6.5 || h >= 21; }
  get player() { return this.actors.find(a => a.isPlayer); }
  building(id) { return this.map.buildings[id]; }
  actorById(id) { return this.actors.find(a => a.id === id); }

  addActor(a) { this.actors.push(a); return a; }

  // ---------- Boucle ----------
  update(ms) {
    if (this.paused) return;
    let rate = MIN_PER_SEC * this.speed;
    const p = this.player;
    const skip = p && p.doing ? (ACTIONS[p.doing].skip ?? DEFAULT_SKIP) : 1;
    this.fast = skip > 1;
    if (this.fast) rate = Math.max(rate, MIN_PER_SEC * skip);
    let dt = (Math.min(ms, 100) / 1000) * rate;
    while (dt > 0) {
      const s = Math.min(dt, 1);
      this.step(s);
      dt -= s;
    }
  }

  step(dt) {
    const prevDay = this.day;
    this.minutes += dt;

    this.weatherIn -= dt;
    if (this.weatherIn <= 0) this.rollWeather();

    for (const a of this.actors) this.updateActor(a, dt);
    for (const a of this.actors) reviewDay(this, a);

    // PNJ, et joueur en mode routine : le même « cerveau » choisit l'action suivante
    for (const a of this.actors) {
      if (a.busy) continue;
      if (a.controller !== 'ai' && !(a.isPlayer && a.routine)) continue;
      a.thinkIn -= dt;
      if (a.thinkIn <= 0) this.think(a);
    }

    if (this.day !== prevDay) this.newDay();
    for (const d of this.directors) d.update(dt);
  }

  think(a) {
    const choice = decide(a, this, { player: a.isPlayer });
    a.thinkIn = a.isPlayer ? 3 : 5 + Math.random() * 20;
    if (!choice) return;
    const params = choice.params || {};
    if (this.check(a, choice.id, params) === true) this.perform(a, choice.id, params);
    else if (!a.isPlayer) this.perform(a, 'goto', this.map.randomWalkable());
  }

  rollWeather() {
    const r = Math.random();
    this.weather = r < 0.55 ? 'sun' : r < 0.8 ? 'cloud' : 'rain';
    this.weatherIn = 180 + Math.random() * 240;
    this.emit('weather', this.weather);
  }

  newDay() {
    newDayHousing(this);
    // Impôts de la semaine (le lundi) : bilan de l'impôt prélevé + taxe foncière des propriétaires
    if (this.weekday === 0) {
      for (const a of this.actors) {
        let property = 0;
        if (a.housing === 'own' && a.home != null) {
          property = Math.round(this.building(a.home).price * PROPERTY_TAX);
          a.money -= property;
          this.treasury = (this.treasury || 0) + property;
        }
        const income = Math.round(a.taxWeek || 0);
        if (income || property) this.emit('taxBill', { actor: a, income, property, rate: a.job ? taxRate(a.job.wage) : 0 });
        a.taxWeek = 0;
      }
    }
    // Assurance / entretien des véhicules, chaque lundi
    if (this.weekday === 0) {
      for (const a of this.actors) {
        for (const id of a.owned) {
          const it = itemById(id);
          if (!it || !it.vehicle || !it.vehicle.weekly) continue;
          a.money -= it.vehicle.weekly;
          this.emit('vehicleBill', { actor: a, amount: it.vehicle.weekly, name: it.name });
        }
      }
    }
    this.emit('newDay', this.day);
  }

  updateActor(a, dt) {
    const sleeping = a.doing === 'sleep' || a.doing === 'sleep_rough';
    a.energy -= (sleeping ? 0 : 0.035) * dt;
    a.hunger += (sleeping ? 0.02 : 0.055) * dt;
    if (a.hunger >= 100) a.energy -= 0.05 * dt;

    // Moral : s'use doucement, plus vite au travail, avec des dettes, la faim ou l'épuisement
    let moodDrift = -0.008;
    if (a.doing === 'work' || a.doing === 'overtime') moodDrift -= 0.012;
    if (a.money < 0) moodDrift -= 0.02;
    if (a.rentLate > 0) moodDrift -= 0.01;
    if (a.hunger > 80 || a.energy < 15) moodDrift -= 0.015;
    if (a.home == null) moodDrift -= 0.02;
    if (a.doing === 'talk' || a.doing === 'listen') moodDrift += 0.12; // parler avec quelqu'un fait du bien
    if (sleeping) moodDrift = 0.004;
    a.mood = clamp((a.mood ?? 70) + moodDrift * dt, 0, 100);
    // Le moral au plus bas fatigue
    if (a.mood < 20) a.energy -= 0.01 * dt;
    if (this.weather === 'rain' && a.outdoors && a.path.length && !a.items.umbrella) a.energy -= 0.04 * dt;

    // Métiers de rue (facteur, police) : on travaille en tournée dans le quartier
    if (a.job && a.job.street && a.outdoors && shiftNow(a.job, this) && this.minutes >= shiftOf(a.job, this.day).start) {
      todayLog(a.job, this.day).worked += dt;
      incomeTax(this, a, a.job.wage / 60 * dt);
    }

    // Bulles de dialogue pendant une discussion
    if (a.doing === 'talk' || a.doing === 'listen') {
      a.bubbleIn = (a.bubbleIn ?? 0) - dt;
      if (a.bubbleIn <= 0) {
        a.bubble = chatterLine(this, a, a.bubbleStep || 0);
        a.bubbleStep = (a.bubbleStep || 0) + 1;
        a.bubbleIn = 3 + Math.random() * 3;
      }
    } else if (a.bubble && !a.bubbleHold) {
      a.bubble = null; a.bubbleStep = 0; a.bubbleIn = 0;
    }
    if (a.bubbleHold) { a.bubbleHold -= dt; if (a.bubbleHold <= 0) { a.bubbleHold = 0; if (!a.doing || (a.doing !== 'talk' && a.doing !== 'listen')) a.bubble = null; } }

    if (a.path.length) {
      this.move(a, dt);
    } else if (a.current) {
      const def = ACTIONS[a.current.id];
      if (def.tick) def.tick(a, this, dt);
      a.current.remaining -= dt;
      if (a.current.remaining <= 0) this.finish(a, a.current.id, a.current.params);
    }
    a.energy = clamp(a.energy, 0, 100);
    a.hunger = clamp(a.hunger, 0, 100);
    a.moving = a.path.length > 0;
  }

  move(a, dt) {
    const v = vehicleOf(a);
    let budget = WALK * dt * (v ? v.vehicle.speed : 1);
    while (budget > 0 && a.path.length) {
      const t = a.path[0];
      const dx = t.x - a.px, dy = t.y - a.py;
      const d = Math.hypot(dx, dy);
      const sdx = dx - dy; // direction horizontale à l'écran
      if (Math.abs(sdx) > 0.01) a.facing = sdx > 0 ? 1 : -1;
      if (d <= budget) {
        a.px = t.x; a.py = t.y;
        a.path.shift();
        budget -= d;
      } else {
        a.px += (dx / d) * budget;
        a.py += (dy / d) * budget;
        budget = 0;
      }
    }
    if (!a.path.length) this.arrive(a);
  }

  // ---------- Actions (même porte d'entrée pour joueur et PNJ) ----------
  costOf(def, a, params = {}) {
    return typeof def.cost === 'function' ? def.cost(a, this, params) : (def.cost || 0);
  }

  check(a, id, params = {}) {
    const def = ACTIONS[id];
    if (!def) return 'Action inconnue';
    if (def.can) {
      const c = def.can(a, this, params);
      if (c !== true) return c;
    }
    const cost = this.costOf(def, a, params);
    if (cost > 0 && cost > a.money) return 'Pas assez d’argent';
    if (def.place && this.placeIds(a, def.place, params).size === 0) return 'Aucun lieu disponible';
    if (def.seller && def.place && this.openIds(a, def, params).size === 0) return 'Fermé à cette heure (personne au comptoir)';
    return true;
  }

  // Lieux de ce type ouverts : un employé est en service (ou c'est ton propre lieu de travail)
  openIds(a, def, params = {}) {
    const ids = this.placeIds(a, def.place, params);
    return new Set([...ids].filter(id => sellerAt(this, this.building(id), a) || (a.job && a.job.building === id)));
  }

  perform(a, id, params = {}) {
    const ok = this.check(a, id, params);
    if (ok !== true) return this.fail(a, id, ok);
    const def = ACTIONS[id];

    if (def.instant) {
      const cost = this.costOf(def, a, params);
      a.money -= cost;
      this.finish(a, id, params, true, cost);
      return { ok: true };
    }

    if (def.here) { // sur place : pas de déplacement
      this.cancel(a);
      a.plan = { id, params, buildingId: a.inside };
      this.emit('plan', { actor: a, id });
      this.arrive(a);
      return { ok: true };
    }

    let isGoal, ids = null;
    if (id === 'goto') {
      const { x, y } = params;
      if (!this.map.walk(x, y)) return this.fail(a, id, 'Impossible d’aller là');
      isGoal = (gx, gy) => gx === x && gy === y;
    } else {
      ids = def.seller ? this.openIds(a, def, params) : this.placeIds(a, def.place, params);
      isGoal = (gx, gy) => (this.map.entranceMap.get(`${gx},${gy}`) || []).some(i => ids.has(i));
    }

    const res = findPath(this.map, { x: a.px, y: a.py }, isGoal);
    if (!res) return this.fail(a, id, 'Chemin introuvable');

    this.cancel(a, true);
    const buildingId = ids ? this.map.entranceMap.get(`${res.goal.x},${res.goal.y}`).find(i => ids.has(i)) : null;
    a.plan = { id, params, buildingId };
    a.path = res.path;
    this.emit('plan', { actor: a, id });
    if (!a.path.length) this.arrive(a);
    return { ok: true };
  }

  // L'action peut-elle se faire dans le bâtiment b ? (utile pour l'UI et les intérieurs)
  canDoAt(a, id, b) {
    const def = ACTIONS[id];
    return !!(def && def.place && !def.place.param && this.placeIds(a, def.place).has(b.id));
  }

  placeIds(a, place, params = {}) {
    if (!place) return new Set();
    if (place.param) return new Set(params[place.param] != null ? [params[place.param]] : []);
    if (place.own === 'home') return new Set(a.home != null ? [a.home] : []);
    if (place.own === 'job') return new Set(a.job ? [a.job.building] : []);
    return new Set(this.map.buildings.filter(b => b.type === place.type).map(b => b.id));
  }

  arrive(a) {
    const plan = a.plan;
    if (!plan) return;
    a.plan = null;
    if (plan.id === 'goto') { this.emit('arrive', { actor: a }); return; }
    const def = ACTIONS[plan.id];
    if (def.stay) { this.stay(a, plan.buildingId); this.emit('start', { actor: a, id: plan.id }); return; }
    // les conditions ont pu changer pendant le trajet
    const ok = this.check(a, plan.id, plan.params);
    if (ok !== true) { this.stay(a, plan.buildingId); this.fail(a, plan.id, ok); return; }
    if (def.seller && !sellerAt(this, this.building(plan.buildingId), a) && !(a.job && a.job.building === plan.buildingId)) {
      this.stay(a, plan.buildingId); this.fail(a, plan.id, 'Fermé : plus personne au comptoir'); return;
    }
    const cost = this.costOf(def, a, plan.params);
    a.money -= cost;
    a.inside = plan.buildingId;
    const dur = def.durationFor ? def.durationFor(a, this, plan.params) : def.duration;
    a.current = { id: plan.id, params: plan.params, remaining: dur, total: dur, buildingId: plan.buildingId, cost };
    if (def.onStart) def.onStart(a, this, plan.params);
    this.emit('start', { actor: a, id: plan.id });
  }

  finish(a, id, params, instant = false, instantCost = 0) {
    const def = ACTIONS[id];
    const where = !instant && a.current ? a.current.buildingId : null;
    const cost = instant ? instantCost : (a.current && a.current.cost) || 0;
    const before = { money: a.money + cost, energy: a.energy, hunger: a.hunger, mood: a.mood };
    let msg = def.effect ? def.effect(a, this, params || {}) : null;
    // Qui t'a servi ?
    const shopId = instant ? a.inside : where;
    if (def.seller && shopId != null) {
      const s = sellerAt(this, this.building(shopId), a);
      if (s && !msg) msg = `Servi·e par ${s.name}`;
    }
    a.energy = clamp(a.energy, 0, 100);
    a.hunger = clamp(a.hunger, 0, 100);
    if (!instant) this.stay(a, where); // on reste dans le lieu après l'action
    a.mood = clamp(a.mood, 0, 100);
    const delta = { money: a.money - before.money, energy: a.energy - before.energy, hunger: a.hunger - before.hunger, mood: a.mood - before.mood };
    this.emit('done', { actor: a, id, def, delta, msg });
  }

  // Arrête ce que fait l'acteur. Sans `leave`, il reste dans le lieu où il se trouve.
  cancel(a, leave = false) {
    const had = a.doing || a.plan || a.path.length || (leave && a.inside != null);
    const where = a.inside;
    a.current = null; a.inside = null; a.plan = null; a.path = [];
    if (!leave && where != null) this.stay(a, where);
    if (had) this.emit('cancel', { actor: a });
  }

  stay(a, buildingId) {
    if (buildingId == null) { a.current = null; a.inside = null; return; }
    a.inside = buildingId;
    a.current = { id: 'stay', params: {}, remaining: Infinity, total: Infinity, buildingId };
  }

  fail(a, id, reason) {
    this.emit('fail', { actor: a, id, reason });
    return { ok: false, reason };
  }
}
