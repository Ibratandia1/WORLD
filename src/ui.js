import { ACTIONS, nextShiftText } from './sim/actions.js';
import { TYPES } from './map/types.js';
import { state } from './state.js';
import { openCustomizer } from './customize.js';
import { fmtShift, DAY_SHORT, MAX_WARNINGS, RAISE_EVERY, JOB_TITLES, openings, isWorkday } from './sim/jobs.js';
import { rel, level, near } from './sim/social.js';
import { weeklyRent, occupants, LATE_EVICT } from './sim/housing.js';
import { freeUnits, isClosed } from './sim/city.js';
import { Sound } from './audio.js';
import { isPolice, jailed } from './sim/safety.js';
import { SEASON_INFO } from './sim/world.js';
import { cityPulse } from './city/render.js';
import { TUTORIAL, TUT_REWARD, TUT_FINAL, DREAMS, tutStep, tutReady, dreamClaimable, nextDream } from './sim/goals.js';
import { TAX_POLICIES, AID_POLICIES, CAMPAIGN_FEE, PROJECTS } from './sim/gov.js';
import { CATALOG } from './sim/catalog.js';
import { canReach } from './sim/actions.js';
import { ROLE_TITLES } from './sim/social.js';
import { jobTitle, sellerAt, nextOpening, weekdayOf, taxRate, PROPERTY_TAX, nextShift } from './sim/jobs.js';
import { sendChat, sendTopic, sendChoice, topicsFor, chatLog, chatMode, engage } from './chat.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
const dur = m => {
  m = Math.max(0, Math.round(m));
  if (m < 60) return `${m} min`;
  const r = m % 60;
  return `${Math.floor(m / 60)} h${r ? String(r).padStart(2, '0') : ''}`;
};
const hearts = r => '❤'.repeat(Math.round(r / 20)) + '♡'.repeat(5 - Math.round(r / 20));
const SOCIAL = ['talk', 'treat', 'ask_tip', 'wave', 'joke', 'gift', 'stroll'];

// Interface en HTML par-dessus le canvas : barre d'icônes + fenêtre en bas à droite.
// La fenêtre montre, par priorité : un lieu touché, « Ma vie », une personne touchée, un événement, ton activité.
export class UI {
  constructor(world, player, director) {
    this.world = world;
    this.player = player;
    this.director = director;
    this.place = null;
    this.person = null;
    this.life = false;
    this.reply = null;
    this.statusKey = '';
    this.personKey = '';
    this.acc = 1e9;

    const mine = e => e.actor === player;
    world.on('event', () => { this.closePanels(); this.render(true); this.buzz(); });
    world.on('eventClosed', () => this.render());
    for (const ev of ['plan', 'start', 'cancel', 'arrive']) world.on(ev, e => { if (mine(e)) this.refresh(); });
    world.on('done', e => {
      if (!mine(e)) return;
      if (this.person && SOCIAL.includes(e.id) && e.msg) chatLog(this.person).push({ from: 'note', text: e.msg });
      this.refresh(true);
    });

    $('box').addEventListener('click', e => this.onBoxClick(e));
    $('box').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('chat-in');
      if (inp) { const v = inp.value; inp.value = ''; this.submitChat(v); }
    });
    $('b-look').onclick = () => openCustomizer();
    $('b-center').onclick = () => state.scene && state.scene.centerOnPlayer();
    $('b-routine').onclick = () => { player.routine = !player.routine; player.thinkIn = 0; this.syncControls(); this.refresh(true); };
    $('b-pause').onclick = () => { world.paused = !world.paused; this.syncControls(); };
    $('b-play').onclick = () => { world.paused = false; world.speed = 1; this.syncControls(); };
    $('b-fast').onclick = () => { world.paused = false; world.speed = 4; this.syncControls(); };
    $('b-full').onclick = () => {
      const el = document.documentElement;
      if (document.fullscreenElement) return document.exitFullscreen();
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      }
    };
    $('p-job').onclick = () => this.showLife();
    $('p-home').onclick = () => this.showLife();
    $('p-next').onclick = () => this.showLife();
    $('b-exit').onclick = () => { world.perform(player, 'leave'); this.render(); };

    // Sons : clic sur les boutons, événement, argent gagné, récompense, erreur
    const snd = this.sound = state.sound = new Sound();
    $('b-sound').textContent = snd.on ? '🔊' : '🔇';
    $('b-sound').onclick = () => { $('b-sound').textContent = snd.toggle() ? '🔊' : '🔇'; };
    document.addEventListener('click', e => { if (e.target.closest('button')) snd.click(); }, true);
    world.on('event', () => snd.chime());
    world.on('fail', e => { if (mine(e)) snd.error(); });
    world.on('done', e => {
      if (!mine(e)) return;
      if (e.id === 'claim_goal') snd.fanfare();
      else if (e.delta && e.delta.money >= 1) snd.coin();
    });
    $('b-map').onclick = () => this.showPanel('map');
    $('b-people').onclick = () => this.showPanel('people');
    $('quest').addEventListener('click', e => this.onQuestClick(e));
    $('tip').onclick = () => { $('tip').classList.remove('show'); this.tipOn = false; };
    // carte d'objectif réduite par défaut sur téléphone (on la touche pour l'ouvrir)
    try { const v = localStorage.getItem('world.questMin'); this.questMin = v == null ? window.innerHeight < 500 : !!v; } catch { this.questMin = window.innerHeight < 500; }
    this.syncControls();
    this.render();
  }

  buzz() {
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(25);
  }

  syncControls() {
    const w = this.world;
    $('b-pause').classList.toggle('on', w.paused);
    $('b-play').classList.toggle('on', !w.paused && w.speed === 1);
    $('b-fast').classList.toggle('on', !w.paused && w.speed > 1);
    $('b-routine').classList.toggle('on', this.player.routine);
  }

  // Appelé à chaque image par la scène ; on rafraîchit ~6 fois par seconde.
  update(dt) {
    this.acc += dt;
    if (this.acc < 160) return;
    this.acc = 0;
    const w = this.world, p = this.player;

    $('v-time').textContent = w.clock;
    $('v-day').textContent = `${w.dayShort} ${SEASON_INFO[w.season].icon}`;
    $('v-weather').textContent = w.weather === 'rain' ? '🌧️' : w.weather === 'snow' ? '❄️' : w.weather === 'cloud' ? '☁️' : w.isNight ? '🌙' : '☀️';
    $('v-money').textContent = money(p.money);
    $('p-money').classList.toggle('neg', p.money < 0);
    this.bar('v-energy', p.energy);
    this.bar('v-hunger', 100 - p.hunger);
    this.bar('v-mood', p.mood);
    $('v-food').textContent = p.food;

    // Travail : heure de début (ou ● pendant le service) et avertissements
    $('v-job').textContent = !p.job ? '—' : p.doing === 'work' || p.doing === 'overtime' ? '●' : `${p.job.start}h`;
    $('v-warn').textContent = p.job && p.job.warnings ? `⚠${p.job.warnings}` : '';
    // Logement : ✓ à jour, -X € à payer, 🔑 propriétaire, ✖ sans logement
    const home = $('v-home');
    $('v-homeic').textContent = p.housing === 'own' ? '🔑' : '🏠';
    home.textContent = p.home == null ? '✖' : p.housing === 'own' ? '✓' : p.rentDue > 0 ? `-${p.rentDue}` : '✓';
    $('p-home').classList.toggle('neg', p.home == null || p.rentDue > 0);

    document.body.classList.toggle('skipping', w.fast && !w.paused);

    // Prochain rendez-vous, objectif en cours, astuces
    const next = this.nextAppointment();
    $('p-next').classList.toggle('hidden', !next);
    if (next) { $('v-nexti').textContent = next[0]; $('v-next').textContent = next[1]; }
    this.syncQuest();
    this.checkTips(performance.now());
    this.tickEvent(dt);

    // Ambiance sonore : dehors / dedans, météo, heure, saison
    if (p.inside !== this.lastInside) { if (this.lastInside !== undefined) this.sound.door(); this.lastInside = p.inside; }
    this.sound.setScene({
      outdoors: p.outdoors, weather: w.weather, hour: w.hour, season: w.season,
      place: p.inside != null ? w.building(p.inside).type : null, pulse: cityPulse(w.hour),
      fest: w.festivals && p.outdoors ? w.festivals.around(p)[0] || null : null,
    });

    const h = w.hour;
    let night = 0;
    if (h >= 20 && h < 23) night = (h - 20) / 3;
    else if (h >= 23 || h < 5) night = 1;
    else if (h >= 5 && h < 7.5) night = 1 - (h - 5) / 2.5;
    // nuit plus douce pour que les lumières ressortent ; intérieurs éclairés
    // dehors, l'obscurité est gérée dans le jeu (pour que les lumières restent vives)
    $('night').style.opacity = (night * (p.inside != null ? 0.12 : 0)).toFixed(2);

    if (this.object) {
      if (this.objectNear(this.object) !== this.objectKey) this.render(); // on vient d'arriver près de l'objet
    } else if (this.person) {
      engage(this.person); // tant que la fenêtre est ouverte, la personne reste avec toi
      const k = this.personSig(this.person);
      if (k !== this.personKey) this.render();
    } else if (!this.place && !this.life && !this.panel && !this.director.active) {
      const info = this.statusInfo();
      if (info.key !== this.statusKey) this.render();
      else if (info.progress != null) {
        const bar = document.querySelector('#box .progress i');
        if (bar) bar.style.width = `${(info.progress * 100).toFixed(1)}%`;
        const sub = document.querySelector('#box .sub');
        if (sub) sub.textContent = info.sub;
      }
    }
  }

  bar(id, v) {
    const el = $(id);
    el.style.width = `${Math.max(0, Math.min(100, v))}%`;
    el.className = v < 25 ? 'low' : v < 50 ? 'mid' : '';
    el.closest('.pill').classList.toggle('crit', v < 15); // jauge critique : la pastille clignote
  }

  closePanels() { this.place = null; this.person = null; this.life = false; this.object = null; this.panel = null; }
  refresh(force = false) {
    if (force || (!this.place && !this.life && !this.person && !this.panel && !this.director.active)) this.render();
  }

  showPlace(b) { this.closePanels(); this.place = b; this.render(true); }
  showPerson(a) { this.closePanels(); this.person = a; this.reply = null; this.chatOffers = []; this.chatChoices = []; engage(a); this.render(true); }
  showLife() { this.closePanels(); this.life = true; this.render(true); }
  showObject(o) { this.closePanels(); this.object = o; this.render(true); }

  // Distance du joueur à un objet de la rue (en cases)
  objectNear(o) {
    if (!o.at) return true;
    const p = this.player;
    return p.outdoors && Math.hypot(p.px - o.at.x, p.py - o.at.y) <= 1.6;
  }

  // Objet touché : les choses qu'on peut faire avec
  objectHTML(o) {
    const isNear = this.objectNear(o);
    const buttons = o.actions.map(id => {
      if (!isNear) return this.choiceHTML('', ACTIONS[id].icon, ACTIONS[id].label, '', 'Approche-toi d’abord');
      if (o.building && ACTIONS[id].place && !this.world.canDoAt(this.player, id, o.building)) return this.choiceHTML('', ACTIONS[id].icon, ACTIONS[id].label, '', 'Pas possible ici');
      return this.actBtn(id);
    });
    if (!isNear) buttons.unshift(this.choiceHTML('data-goobj', '🚶', 'Y aller', '', true));
    return `${this.head(o.icon, o.name)}<div class="choices">${buttons.join('')}</div>`;
  }

  goToObject(o) {
    const w = this.world, p = this.player;
    const tiles = [o.at, ...[[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: o.at.x + dx, y: o.at.y + dy }))]
      .map(t => ({ x: Math.round(t.x), y: Math.round(t.y) })).filter(t => w.map.walk(t.x, t.y));
    tiles.sort((a, b) => Math.hypot(a.x - p.px, a.y - p.py) - Math.hypot(b.x - p.px, b.y - p.py));
    if (tiles.length) w.perform(p, 'goto', tiles[0]);
    this.render();
  }

  // ---------- Contenu de la fenêtre ----------
  render(pop = false) {
    const box = $('box');
    if (this.place) box.innerHTML = this.placeHTML(this.place);
    else if (this.life) box.innerHTML = this.lifeHTML();
    else if (this.panel === 'map') box.innerHTML = this.mapHTML();
    else if (this.panel === 'people') box.innerHTML = this.peopleHTML();
    else if (this.person) {
      // on garde ce qui est en train d'être tapé
      const inp = $('chat-in');
      const typed = inp ? inp.value : '', focused = inp && document.activeElement === inp;
      this.personKey = this.personSig(this.person);
      box.innerHTML = this.personHTML(this.person);
      const n = $('chat-in');
      if (n) { n.value = typed; if (focused) n.focus(); }
      const lg = box.querySelector('.log'); if (lg) lg.scrollTop = lg.scrollHeight;
    }
    else if (this.object) { this.objectKey = this.objectNear(this.object); box.innerHTML = this.objectHTML(this.object); }
    else if (this.director.active) box.innerHTML = this.eventHTML(this.director.active);
    else {
      const info = this.statusInfo();
      this.statusKey = info.key;
      box.innerHTML = info.stay ? this.placeHTML(info.stay, true) : this.statusHTML(info);
    }
    if (pop) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }

  head(icon, title, close = true) {
    return `<div class="box-head"><span class="ico">${icon}</span><b>${esc(title)}</b>${close ? '<button class="box-close" data-close>✕</button>' : ''}</div>`;
  }

  choiceHTML(attrs, icon, label, meta, check) {
    const off = check !== true;
    return `<button ${attrs} ${off ? 'disabled' : ''}><span>${icon}</span>
      <div class="lbl">${esc(label)}${off ? `<small>${esc(check)}</small>` : ''}</div>${meta ? `<em>${meta}</em>` : ''}</button>`;
  }

  // Bouton générique pour une action (avec paramètres) — icône personnalisable
  actBtn(id, params = {}, label = null, icon = null) {
    const def = ACTIONS[id], p = this.player;
    const attrs = `data-act="${id}" data-p="${esc(JSON.stringify(params))}"`;
    return this.choiceHTML(attrs, icon || def.icon, label || def.label, this.meta(def, params), this.world.check(p, id, params));
  }

  // Articles en vente dans ce type de lieu
  shopHTML(b, inside) {
    const items = CATALOG.filter(i => i.shop === b.type);
    if (!items.length) return '';
    if (!inside) return '<p>🛍️ Entre pour voir les articles.</p>';
    const p = this.player;
    let cat = '';
    const rows = items.map(it => {
      const head = it.cat !== cat ? `<div class="cat">${(cat = it.cat)}</div>` : '';
      if (!p.owned.includes(it.id)) return head + this.actBtn('buy', { item: it.id }, it.name, it.icon);
      if (it.vehicle) {
        return head + (p.vehicle === it.id
          ? this.choiceHTML('', it.icon, `${it.name} · utilisé`, '✓', true)
          : this.actBtn('use_vehicle', { item: it.id }, `Utiliser : ${it.name}`, it.icon));
      }
      return head + this.choiceHTML('data-look', it.icon, `${it.name} · à toi`, '👕', true);
    });
    return `<div class="sec"><b>🛍️ Boutique</b><div class="choices">${rows.join('')}</div></div>`;
  }

  meta(def, params = {}) {
    const m = [];
    const cost = this.world.costOf(def, this.player, params);
    if (cost) m.push(`-${money(cost)} €`);
    if (def.duration) m.push(dur(def.duration));
    return m.join(' · ');
  }

  eventHTML(ev) {
    const buttons = ev.choices.map((c, i) => {
      const def = c.action ? ACTIONS[c.action] : null;
      return this.choiceHTML(`data-choice="${i}"`, c.icon, c.label, def ? this.meta(def, c.params) : '', this.director.check(c));
    }).join('');
    // ✕ en haut : fermer l'événement sans choisir
    const head = `<div class="box-head"><span class="ico">${ev.icon}</span><b>${esc(ev.title)}</b><button class="box-close ev-close" data-evclose title="Fermer">✕</button></div>`;
    return `${head}<p>${esc(ev.text).replace(/\n/g, '<br>')}</p><div class="choices">${buttons}</div><div class="evtimer"><i style="width:100%"></i></div>`;
  }

  // Panneau d'un lieu : vu de la rue (inside = false) ou depuis l'intérieur.
  placeHTML(b, inside = false) {
    const p = this.player, w = this.world;
    const buttons = [];
    if (!inside) buttons.push(this.actBtn('enter', { building: b.id }));
    // Ici même (pas dans le commerce du même type le plus proche)
    for (const id of Object.keys(ACTIONS)) if (!ACTIONS[id].custom && w.canDoAt(p, id, b)) buttons.push(this.actBtn(id, ACTIONS[id].place.type ? { at: b.id } : {}));

    // Emploi
    let note = '';
    if (b.jobs && !(p.job && p.job.building === b.id)) {
      const n = openings(w, b);
      note = `<p>${n ? `${n} poste${n > 1 ? 's' : ''} libre${n > 1 ? 's' : ''} · ${b.jobs.wage} €/h` : 'Pas de poste libre pour l’instant.'}</p>`;
      buttons.push(this.actBtn('apply', { building: b.id }, `Postuler (${b.jobs.wage} €/h)`));
    } else if (p.job && p.job.building === b.id) {
      note = `<p>Ton travail · ${fmtShift(p.job)} · ${p.job.days.map(d => DAY_SHORT[d]).join(' ')}</p>`;
    }

    // Logement
    if (b.type === 'home') {
      if (b.id === p.home) {
        note = `<p>${p.housing === 'own' ? 'Tu es propriétaire.' : `Locataire · ${weeklyRent(b)} €/semaine`}</p>`;
        if (p.housing === 'rent') {
          if (p.rentDue > 0) buttons.push(this.actBtn('pay_rent'));
          buttons.push(this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`));
        }
      } else if (freeUnits(w, b) > 0) {
        const f = freeUnits(w, b);
        note = `<p>${f} appartement${f > 1 ? 's' : ''} libre${f > 1 ? 's' : ''} sur ${b.units} · ${weeklyRent(b)} €/semaine${occupants(w, b).length ? '' : ` ou ${money(b.price)} € à l’achat`}</p>`;
        buttons.push(this.actBtn('rent_home', { building: b.id }));
        if (!occupants(w, b).length) buttons.push(this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`));
      } else if (!inside) {
        note = `<p>Complet : ${b.units} appartement${b.units > 1 ? 's' : ''}, tous occupés.</p>`;
      }
      // La nuit, on peut tenter un cambriolage (très risqué)
      if (b.id !== p.home && occupants(w, b).length && (w.hour >= 23 || w.hour < 5)) buttons.push(this.actBtn('burgle', { building: b.id }));
    }

    // Services publics : un mot sur ce qu'on y fait
    const SERVICE = {
      police: () => { const s = w.safety ? w.safety.stats : { week: 0, arrests: 0 }; return `🚨 ${s.week} délit${s.week > 1 ? 's' : ''} cette semaine · ${s.arrests} arrestation${s.arrests > 1 ? 's' : ''} au total${p.wanted > 0 ? ' · <span class="bad">tu es recherché·e !</span>' : ''}`; },
      hospital: () => (p.sick ? '🤧 Tu es malade : un médecin peut te soigner.' : '🩺 Consultations quand un soignant est de service.'),
      firestation: () => { const n = w.safety ? Object.keys(w.safety.fires).length : 0; return n ? `🔥 ${n} incendie${n > 1 ? 's' : ''} en cours !` : '🚒 Aucun incendie. Les pompiers veillent.'; },
      prison: () => { const n = w.actors.filter(o => jailed(w, o)).length; return `⛓️ ${n} détenu${n > 1 ? 's' : ''}`; },
      school: () => `🎓 Ton niveau d’études : ${p.education ?? 1}/3 · cours du soir : 3 cours = 1 diplôme`,
    };
    if (SERVICE[b.type]) note = `${note}<p>${SERVICE[b.type]()}</p>`;
    if (w.safety && w.safety.burning(b.id)) note = `<p class="status bad">🔥 En feu ! Personne ne peut entrer.</p>${note}`;
    // Commerce : ouvert seulement s'il y a quelqu'un au comptoir
    if (['cafe', 'bakery', 'shop', 'fashion', 'garage', 'cityhall', 'hospital', 'school'].includes(b.type)) {
      const s = sellerAt(w, b, p);
      let status;
      if (s) status = `🟢 Ouvert · ${esc(s.name)} au comptoir`;
      else {
        const n = nextOpening(w, b);
        const when = !n ? '' : n.day === w.day ? `aujourd’hui à ${Math.floor((n.start % 1440) / 60)}h` : `${DAY_SHORT[weekdayOf(n.day)]} à ${Math.floor((n.start % 1440) / 60)}h`;
        status = `🔴 Fermé${when ? ` · ouvre ${when}` : ''}`;
      }
      // Santé du commerce (ville vivante) : fréquentation et prix
      const biz = w.city && w.city.biz[b.id];
      let life = '';
      if (biz && biz.closed) {
        status = `🔒 Fermé définitivement · un repreneur arrive ${biz.reopenDay - w.day <= 1 ? 'demain' : `dans ${biz.reopenDay - w.day} jours`}`;
      } else if (biz && biz.hist.length) {
        const avg = biz.hist.reduce((t, d) => t + d.n, 0) / biz.hist.length;
        const mood = avg >= 12 ? '🔥 Bondé' : avg >= 5 ? '🙂 Bonne clientèle' : avg >= 2 ? '😐 Calme' : '⚠️ Presque vide';
        const price = biz.price === 1 ? 'prix normaux' : biz.price > 1 ? `prix +${Math.round((biz.price - 1) * 100)} %` : `promos −${Math.round((1 - biz.price) * 100)} %`;
        life = `<p>${mood} · ${Math.round(avg * 10) / 10} clients/jour · ${price}</p>`;
      }
      note = `<p class="status">${status}</p>${life}${note}`;
    }

    if (inside) {
      if (!note) note = '<p>Touche un meuble ou une personne.</p>';
      buttons.push(this.choiceHTML('data-leave', '🚶', 'Sortir dans la rue', '', true));
    }
    const icon = b.type === 'home' && b.id === p.home ? (p.housing === 'own' ? '🔑' : '🏠') : TYPES[b.type].icon;
    return `${this.head(icon, b.name, !inside)}${note}<div class="choices">${buttons.join('')}</div>${this.shopHTML(b, inside)}${b.type === 'cityhall' ? this.govHTML(b, inside) : ''}`;
  }

  // Mairie : le maire, la politique, les caisses, les élections (vote, candidature), les décisions du maire
  govHTML(b, inside) {
    const w = this.world, g = w.gov, p = this.player;
    if (!g) return '';
    const m = g.mayorActor;
    const lines = [
      `👤 Maire : <b>${m ? esc(m.isPlayer ? `${m.name} (toi)` : m.name) : 'vacant'}</b>`,
      `${TAX_POLICIES[g.tax].icon} ${TAX_POLICIES[g.tax].label} · ${AID_POLICIES[g.aid].icon} ${AID_POLICIES[g.aid].label} (${g.aidAmount} €/semaine)`,
      `🏦 Trésor public : ${money(Math.round(w.treasury || 0))} € · aides versées : ${money(g.aidPaid)} €`,
    ];
    const rows = [];
    if (g.campaignOpen && g.candidates.length) {
      lines.push(g.votingOpen ? `🗳️ <b>Vote en cours</b> jusqu’au jour ${g.election}` : `🗳️ Campagne : vote du jour ${g.election - 2} au jour ${g.election}`);
      for (const id of g.candidates) {
        const c = w.actorById(id);
        if (!c) continue;
        rows.push(this.actBtn('vote', { for: id }, `Voter ${c.isPlayer ? 'pour toi' : c.name}${id === g.mayor ? ' (sortant)' : ''}`));
      }
    } else {
      lines.push(`🗳️ Prochaines élections : jour ${g.election} (candidatures 5 jours avant)`);
    }
    rows.push(this.actBtn('run_mayor', {}, `Se présenter (caution ${CAMPAIGN_FEE} €)`));
    if (g.mayor === p.id) {
      for (const k of Object.keys(TAX_POLICIES)) rows.push(this.actBtn('set_policy', { tax: k }, TAX_POLICIES[k].label, TAX_POLICIES[k].icon));
      for (const k of Object.keys(AID_POLICIES)) rows.push(this.actBtn('set_policy', { aid: k }, AID_POLICIES[k].label, AID_POLICIES[k].icon));
      for (const [k, pr] of Object.entries(PROJECTS)) {
        const cost = pr.cost + (pr.each || 0) * w.actors.length;
        rows.push(this.actBtn('city_project', { project: k }, `${pr.label} · ${money(cost)} €`, pr.icon));
      }
    }
    return `<div class="sec"><b>🏛️ La mairie</b><p>${lines.join('<br>')}</p><div class="choices">${rows.join('')}</div></div>`;
  }

  // « Ma vie » : contrat, logement, routine
  lifeHTML() {
    const p = this.player, w = this.world;
    let job;
    if (p.job) {
      const b = w.building(p.job.building);
      const warn = p.job.warnings ? '⚠️'.repeat(p.job.warnings) : 'aucun';
      job = `<div class="sec"><b>💼 ${esc(b.name)}</b><p>${JOB_TITLES[b.type]} · ${p.job.wage} €/h<br>
        ${fmtShift(p.job)} · ${p.job.days.map(d => DAY_SHORT[d]).join(' ')}<br>
        Prochain service : ${nextShiftText(p, w) || '—'}<br>
        Avertissements : ${warn} (${p.job.warnings}/${MAX_WARNINGS})<br>
        🎓 Niveau d’études : ${p.education ?? 1}/3<br>
        Augmentation dans ${RAISE_EVERY - (p.job.streak % RAISE_EVERY)} jour(s) sans faute<br>
        🏛️ Impôt prélevé à la source : ${Math.round(taxRate(p.job.wage) * 100)} % · ${Math.round(p.taxWeek || 0)} € cette semaine</p>
        <div class="choices">${isWorkday(p.job, w.day) ? this.actBtn('call_sick') : ''}${this.actBtn('quit_job')}</div></div>`;
    } else {
      job = '<div class="sec"><b>💼 Sans emploi</b><p>Touche un commerce ou un bureau pour postuler, ou demande des tuyaux à tes connaissances.</p></div>';
    }

    let home;
    if (p.home != null) {
      const b = w.building(p.home);
      if (p.housing === 'own') {
        home = `<div class="sec"><b>🔑 ${esc(b.name)}</b><p>Tu es propriétaire : plus de loyer.<br>🏛️ Taxe foncière : ${Math.round(b.price * PROPERTY_TAX)} € par semaine (le lundi)</p></div>`;
      } else {
        const due = p.rentDue > 0
          ? `<br><span class="bad">À payer : ${p.rentDue} €${p.rentLate ? ` · ${p.rentLate} j de retard (expulsion à ${LATE_EVICT} j)` : ''}</span>`
          : '<br>Loyer à jour ✓';
        home = `<div class="sec"><b>🏠 ${esc(b.name)}</b><p>Locataire · ${weeklyRent(b)} €/semaine, à payer chaque lundi${due}</p>
          <div class="choices">${p.rentDue > 0 ? this.actBtn('pay_rent') : ''}${this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`)}</div></div>`;
      }
    } else {
      home = '<div class="sec"><b>🏠 Sans logement</b><p>Loue un logement libre (touche-le sur la carte) ou dors au Métro Saint-Paul.</p></div>';
    }

    const vehicles = CATALOG.filter(i => i.vehicle && p.owned.includes(i.id));
    const ride = vehicles.length
      ? `<div class="sec"><b>🚲 Déplacements</b><div class="choices">${
        this.actBtn('use_vehicle', { item: null }, 'Marcher', '🚶')}${vehicles.map(v => this.actBtn('use_vehicle', { item: v.id }, v.name, v.icon)).join('')}</div></div>`
      : '<div class="sec"><b>🚲 Déplacements</b><p>À pied. Vélos, scooters et voitures au Garage Roue Libre.</p></div>';

    const routine = `<div class="sec"><b>🔁 Routine automatique</b><p>Ton personnage mange, dort et va travailler tout seul. Tu peux toujours reprendre la main.</p>
      <div class="choices">${this.choiceHTML('data-routine', p.routine ? '⏹️' : '▶️', p.routine ? 'Désactiver la routine' : 'Activer la routine', '', true)}</div></div>`;
    return `${this.head('📋', 'Ma vie')}${this.dreamsHTML()}${job}${home}${ride}${routine}`;
  }

  // ---------- Objectifs : rêves (dans « Ma vie ») et carte d'objectif ----------
  dreamsHTML() {
    const p = this.player, w = this.world;
    if (tutStep(p)) return `<div class="sec"><b>🌟 Mes rêves</b><p>Termine d’abord tes premiers pas (en haut à gauche) : tes rêves se débloquent ensuite.</p></div>`;
    const rows = DREAMS.map(d => {
      const [c, m] = d.progress(p, w);
      const got = p.goals.claimed[d.id];
      const pct = Math.min(100, (c / m) * 100);
      const val = m > 1 ? ` · ${money(Math.min(c, m))}/${money(m)}` : '';
      if (!got && c >= m) return this.actBtn('claim_goal', { goal: d.id }, `${d.label} : récupérer ${d.reward.money ? `+${d.reward.money} €` : 'ta récompense'}`, d.icon);
      return `<div class="dream ${got ? 'ok' : ''}"><span class="ic">${d.icon}</span><div class="nm">${esc(d.label)}${got ? ' ✓' : val}
        ${got ? '' : `<div class="qbar"><i style="width:${pct.toFixed(0)}%"></i></div>`}</div></div>`;
    });
    const n = DREAMS.filter(d => p.goals.claimed[d.id]).length;
    return `<div class="sec"><b>🌟 Mes rêves · ${n}/${DREAMS.length}</b><div class="choices">${rows.join('')}</div></div>`;
  }

  syncQuest() {
    const p = this.player, w = this.world, el = $('quest');
    if (!p.goals) return;
    const step = tutStep(p);
    let key = '', html = '';
    if (step) {
      const ready = tutReady(p);
      const last = p.goals.tut === TUTORIAL.length - 1;
      const gain = TUT_REWARD.money + (last ? TUT_FINAL.money : 0);
      key = `t${p.goals.tut}:${ready}`;
      html = `<div class="qh"><span>🎯</span>Premiers pas<em>${p.goals.tut + 1}/${TUTORIAL.length}</em></div>
        <div class="qt"><span>${step.icon}</span>${esc(step.text)}${ready ? ' ✓' : ''}</div>
        ${ready ? '' : `<div class="qhint">${esc(step.hint)}</div>`}
        <div class="qbtns ${ready ? 'keep' : ''}">${ready ? `<button class="go" data-claim="tut">🎁 Récupérer +${gain} €</button>` : `<button data-show="${step.target}">👀 Montrer</button>`}</div>`;
    } else {
      const done = DREAMS.find(d => dreamClaimable(p, w, d));
      const d = done || nextDream(p, w);
      if (d) {
        const [c, m] = d.progress(p, w);
        key = `d${d.id}:${!!done}:${Math.floor((c / m) * 50)}`;
        html = `<div class="qh"><span>🌟</span>${done ? 'Rêve réalisé !' : 'Prochain rêve'}<em>${m > 1 ? `${money(Math.min(c, m))}/${money(m)}` : ''}</em></div>
          <div class="qt"><span>${d.icon}</span>${esc(d.label)}</div>
          ${done ? `<div class="qbtns keep"><button class="go" data-claim="${d.id}">🎁 Récupérer${d.reward.money ? ` +${d.reward.money} €` : ''}</button></div>`
            : `<div class="qbar"><i style="width:${Math.min(100, (c / m) * 100).toFixed(0)}%"></i></div>`}`;
      }
    }
    if (key !== this.questKey) { el.innerHTML = html; this.questKey = key; }
    el.classList.toggle('hidden', !html);
    el.classList.toggle('min', !!this.questMin);
  }

  onQuestClick(e) {
    const btn = e.target.closest('button');
    if (btn && btn.dataset.claim) {
      const r = this.world.perform(this.player, 'claim_goal', { goal: btn.dataset.claim });
      if (r.ok) { this.questKey = ''; this.syncQuest(); this.buzz(); }
      return;
    }
    if (btn && btn.dataset.show) return this.showTarget(btn.dataset.show);
    // toucher la carte : réduire / agrandir
    this.questMin = !this.questMin;
    try { localStorage.setItem('world.questMin', this.questMin ? '1' : ''); } catch { /* sans stockage */ }
    this.syncQuest();
  }

  // « Montrer » : la caméra va vers le lieu (ou la personne) de l'étape, et sa fiche s'ouvre
  showTarget(kind) {
    const p = this.player, w = this.world, sc = state.scene;
    const dist = b => Math.min(...b.entrances.map(e => Math.abs(e.x - p.px) + Math.abs(e.y - p.py)));
    let b = null;
    if (kind === 'job' && p.job) b = w.building(p.job.building);
    else if (kind === 'home' && p.home != null) b = w.building(p.home);
    else if (kind === 'people') {
      const t = w.actors.filter(o => o !== p && o.outdoors && o.doing !== 'work').sort((x, y) => Math.hypot(x.px - p.px, x.py - p.py) - Math.hypot(y.px - p.px, y.py - p.py))[0];
      if (t) { if (p.inside != null) w.perform(p, 'leave'); if (sc) sc.focusActor(t); return this.showPerson(t); }
      return;
    } else {
      const types = kind === 'breakfast' ? ['bakery', 'cafe'] : [kind];
      const list = w.map.buildings.filter(x => types.includes(x.type) && !isClosed(w, x.id)).sort((x, y) => dist(x) - dist(y));
      b = list.find(x => sellerAt(w, x)) || list[0];
    }
    if (!b) return;
    if (sc && p.inside == null) sc.focusBuilding(b);
    this.showPlace(b);
  }

  // ---------- Plan des lieux et répertoire des habitants ----------
  showPanel(kind) { const same = this.panel === kind; this.closePanels(); this.panel = same ? null : kind; this.render(true); }

  mapHTML() {
    const p = this.player, w = this.world;
    const walk = b => Math.max(1, Math.round(Math.min(...b.entrances.map(e => Math.abs(e.x - p.px) + Math.abs(e.y - p.py))) / 1.6));
    const GROUPS = [['☕ Manger et boire', ['cafe', 'bakery']], ['🛍️ Boutiques', ['shop', 'fashion', 'garage']],
      ['💼 Travail', ['office']], ['🏛️ Services', ['cityhall', 'metro']], ['🏠 Logements', ['home']]];
    const status = b => {
      if (b.type === 'home') {
        if (b.id === p.home) return '🏠 chez toi';
        const f = freeUnits(w, b);
        return f ? `🔑 ${f} libre${f > 1 ? 's' : ''} · ${weeklyRent(b)} €/sem.` : 'complet';
      }
      if (b.type === 'metro') return 'bientôt : voyager';
      if (isClosed(w, b.id)) return '🔒 fermé (repreneur à venir)';
      const mine = p.job && p.job.building === b.id ? ' · ton travail' : '';
      const jobs = b.jobs && openings(w, b) ? ` · ${openings(w, b)} poste${openings(w, b) > 1 ? 's' : ''}` : '';
      if (b.type === 'office') return `${mine ? 'ton travail' : 'bureaux'}${jobs}`;
      return `${sellerAt(w, b) ? '🟢 ouvert' : '🔴 fermé'}${mine}${jobs}`;
    };
    const sections = GROUPS.map(([title, types]) => {
      const list = w.map.buildings.filter(b => types.includes(b.type)).sort((a, b) => walk(a) - walk(b));
      if (!list.length) return '';
      return `<div class="sec"><b>${title}</b><div class="list">${list.map(b => `<button data-goto-b="${b.id}">
        <span class="ic">${b.type === 'home' && b.id === p.home ? '🏠' : isClosed(w, b.id) ? '🔒' : TYPES[b.type].icon}</span>
        <span class="nm">${esc(b.name)}<small>${status(b)}</small></span><span class="rt">🚶 ${walk(b)} min</span></button>`).join('')}</div></div>`;
    });
    return `${this.head('🗺️', `Plan · ${w.map.name}`)}${sections.join('')}`;
  }

  peopleHTML() {
    const p = this.player, w = this.world;
    const where = a => (a.inside != null ? (a.inside === a.home ? 'à la maison' : w.building(a.inside).name) : 'dans la rue');
    const list = w.actors.filter(a => a !== p).sort((a, b) => rel(p, b) - rel(p, a) || a.name.localeCompare(b.name, 'fr'));
    const known = list.filter(a => rel(p, a) >= 10).length;
    const rows = list.map(a => {
      const r = rel(p, a);
      const [, lname, licon] = level(r);
      const job = a.role && ROLE_TITLES[a.role] ? ROLE_TITLES[a.role] : a.job ? jobTitle(w, a.job) : 'Sans emploi';
      const now = a.doing && ACTIONS[a.doing] ? ACTIONS[a.doing].icon : '';
      return `<button data-person="${a.id}"><span class="ic">${licon}</span><span class="nm">${esc(a.name)}<small>${esc(job)} · ${lname}</small></span>
        <span class="rt">${now} ${esc(where(a))}</span></button>`;
    });
    return `${this.head('👥', `Habitants · ${list.length}`)}<p>Tu connais ${known} personne${known > 1 ? 's' : ''}. Touche quelqu’un pour le retrouver.</p><div class="list">${rows.join('')}</div>`;
  }

  // ---------- Prochain rendez-vous (HUD) ----------
  nextAppointment() {
    const p = this.player, w = this.world;
    if (jailed(w, p)) return ['⛓️', `sortie ${Math.ceil((p.jailUntil - w.minutes) / 1440)} j`];
    if (p.wanted > 0) return ['🚨', 'recherché·e'];
    if (p.sick) return ['🤧', 'malade'];
    if (p.housing === 'rent' && p.rentDue > 0) return ['🧾', `${p.rentDue} €`];
    const g = w.gov;
    if (g && g.votingOpen && !g.votes[p.id]) return ['🗳️', 'vote'];
    // (l'heure du service est déjà en bas à gauche : ici, seulement quand il faut y aller maintenant)
    if (p.job && !p.job.street && p.doing !== 'work' && !(p.plan && p.plan.id === 'work')) {
      const n = nextShift(p.job, w);
      if (n && n.start - w.minutes <= 30 && w.minutes < n.end - 60) return ['💼', w.minutes > n.start ? 'en retard !' : 'c’est l’heure'];
    }
    if (w.hour >= 22 || w.hour < 5) return ['😴', 'au lit'];
    return null;
  }

  // ---------- Les événements s'effacent tout seuls après un moment ----------
  // (temps réel, compté seulement quand l'événement est affiché : simple info 12 s, choix à faire 25 s)
  tickEvent() {
    const ev = this.director.active;
    const shown = ev && !this.place && !this.life && !this.person && !this.object && !this.panel;
    if (!ev) { this.evShown = null; return; }
    if (this.evShown !== ev) { this.evShown = ev; this.evLeft = this.evLife(ev); this.evLast = performance.now(); }
    const now = performance.now();
    if (shown) this.evLeft -= now - this.evLast;
    this.evLast = now;
    const bar = document.querySelector('#box .evtimer i');
    if (bar) bar.style.width = `${Math.max(0, this.evLeft / this.evLife(ev)) * 100}%`;
    if (this.evLeft <= 0) { this.director.close(); this.evShown = null; this.render(); }
  }

  evLife(ev) { return ev.choices.some(c => c.action) ? 25000 : 12000; }

  // ---------- Astuces : une à la fois, chacune une seule fois ----------
  checkTips(now) {
    const p = this.player, w = this.world;
    if (now - (this.tipAt || -1e9) < 45000 || this.tipOn) return;
    p.tips = p.tips || [];
    const TIPS = [
      ['hungry', () => p.hunger > 65, '🍔 Ton ventre gargouille : cuisine chez toi (🥫 = repas au frigo) ou va à la boulangerie.'],
      ['tired', () => p.energy < 25, '⚡ Tu fatigues : rentre dormir, ou bois un café pour tenir jusqu’au soir.'],
      ['mood', () => p.mood < 40, '😊 Ton moral baisse : discute avec quelqu’un, regarde la télé, lis ou assieds-toi sur un banc.'],
      ['broke', () => p.money < 60, '💶 Ton argent fond : travaille, ou demande l’aide sociale à la mairie si tu es sans emploi.'],
      ['rent', () => p.rentDue > 0, '🧾 Ton loyer est à payer (le lundi) : touche 🏠 en bas à gauche. Après 8 jours de retard, c’est l’expulsion.'],
      ['inside', () => p.inside != null, '🪑 À l’intérieur, touche un meuble pour l’utiliser : lit, canapé, télé, comptoir…'],
      ['night', () => (w.hour >= 22 || w.hour < 4) && p.outdoors, '🌙 Il se fait tard : rentre dormir pour être en forme demain.'],
      ['vote', () => w.gov && w.gov.votingOpen && !w.gov.votes[p.id], '🗳️ Élections municipales : va voter à la mairie 🏛️ (et tu peux même te présenter !).'],
      ['map', () => !tutStep(p), '🗺️ Le bouton 🗺️ en bas liste tous les lieux du quartier, 👥 tous les habitants.'],
      ['routine', () => !tutStep(p) && w.day >= 2, '🔁 Le bouton 🔁 lance la routine : ton personnage mange, dort et travaille tout seul.'],
      ['dreams', () => !tutStep(p), '🌟 Tes rêves sont dans « Ma vie » (💼 en bas à gauche) : chacun rapporte une récompense.'],
    ];
    const t = TIPS.find(([id, cond]) => !p.tips.includes(id) && cond());
    if (!t) return;
    p.tips.push(t[0]);
    this.tipAt = now; this.tipOn = true;
    const el = $('tip');
    el.textContent = t[2];
    el.classList.add('show');
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => { el.classList.remove('show'); this.tipOn = false; }, 8000);
  }

  personSig(t) {
    const p = this.player;
    return `${near(p, t)}:${rel(p, t)}:${t.doing}:${t.inside}:${p.doing}:${Math.floor(p.money)}`;
  }

  personHTML(t) {
    const p = this.player, w = this.world;
    const r = rel(p, t);
    const [, lname, licon] = level(r);
    const role = t.role ? `${ROLE_TITLES[t.role]} · ` : '';
    const job = t.job ? `${role}${esc(jobTitle(w, t.job))}${t.job.street ? '' : ` · ${esc(w.building(t.job.building).name)}`}` : (t.role ? ROLE_TITLES[t.role] : 'Sans emploi');
    const now = t.doing ? `<br>${ACTIONS[t.doing].icon} ${esc(ACTIONS[t.doing].label)}` : '';
    const reach = canReach(p, t);
    // Interactions : elles se débloquent avec la relation (le bouton grisé dit pourquoi)
    const extra = [];
    if (!near(p, t)) extra.push(this.choiceHTML('data-join', '🚶', 'Rejoindre', '', true));
    extra.push(this.actBtn('wave', { who: t.id }));
    extra.push(this.actBtn('joke', { who: t.id }));
    const nGifts = Object.values(p.gifts || {}).reduce((s, n) => s + n, 0);
    extra.push(this.actBtn('gift', { who: t.id }, nGifts ? `Offrir un cadeau (${nGifts})` : null));
    if (p.inside != null && w.building(p.inside).type === 'cafe') extra.push(this.actBtn('treat', { who: t.id }));
    if (p.outdoors) extra.push(this.actBtn('stroll', { who: t.id }));
    // Police : arrêter une personne recherchée · tout le monde : le vol (risqué, la police veille)
    if (isPolice(p) && t.wanted > 0) extra.push(this.actBtn('arrest', { who: t.id }, `Arrêter ${t.name} (recherché·e)`));
    if (near(p, t) && !isPolice(t)) extra.push(this.actBtn('steal', { who: t.id }));

    // Fil de la conversation
    const log = chatLog(t).slice(-8).map(m => m.from === 'player'
      ? `<div class="msg me">${esc(m.text)}</div>`
      : m.from === 'npc' ? `<div class="msg them"><b>${esc(t.name)}</b> ${esc(m.text)}</div>` : `<div class="msg note">${esc(m.text)}</div>`).join('');
    const offers = (this.chatOffers || []).map((o, i) => this.choiceHTML(`data-offer="${i}"`, o.icon, o.label, '', this.world.check(p, o.action, o.params))).join('');
    // Réponses proposées après la dernière réplique, puis les thèmes
    const picks = (this.chatChoices || []).map((c, i) => `<button class="pick" data-pick="${i}" ${reach && !this.chatWaiting ? '' : 'disabled'}><span>${c.icon}</span>${esc(c.label)}</button>`).join('');
    const topics = topicsFor(t).map(tp => `<button class="topic" data-topic="${tp.id}" ${reach && !this.chatWaiting ? '' : 'disabled'}><span>${tp.icon}</span>${esc(tp.label)}</button>`).join('');
    const mode = chatMode() === 'local' ? '<small class="mode">réponses intégrées · ajoute une clé API pour des PNJ encore plus vivants</small>' : '';
    const intro = reach ? `Choisis un sujet ou écris ce que tu veux dire à ${esc(t.name)}.` : 'Trop loin pour parler.';
    const chat = `<div class="sec chat"><div class="log">${log || `<div class="msg note">${intro}</div>`}${this.chatWaiting ? `<div class="msg them typing">${esc(t.name)} réfléchit…</div>` : ''}</div>
      ${offers ? `<div class="choices">${offers}</div>` : ''}
      ${picks ? `<div class="picks">${picks}</div>` : ''}
      <div class="topics">${topics}</div>
      <form class="say-form" data-chat><input id="chat-in" maxlength="300" autocomplete="off" placeholder="${reach ? 'Ou écris librement…' : 'Trop loin pour parler'}" ${reach && !this.chatWaiting ? '' : 'disabled'}><button type="submit" ${reach ? '' : 'disabled'}>➤</button></form>${mode}</div>`;

    return `${this.head('🧑', t.name)}<p>${licon} ${lname} · <span class="hearts">${hearts(r)}</span><br>${job}${now}</p>
      <div class="sec"><b>✨ Interagir</b><div class="choices">${extra.join('')}</div></div>${chat}`;
  }

  // Envoi commun (texte libre, thème ou réponse proposée)
  async converse(send) {
    const t = this.person;
    if (!t || this.chatWaiting) return;
    this.chatWaiting = true;
    this.chatOffers = [];
    this.chatChoices = [];
    this.render();
    const res = await send(t);
    this.chatWaiting = false;
    if (res.error) chatLog(t).push({ from: 'note', text: res.error });
    else { this.chatOffers = res.offers || []; this.chatChoices = res.choices || []; }
    if (this.person === t) this.render();
  }

  submitChat(text) {
    if (!text.trim()) return;
    this.converse(t => sendChat(t, text.trim())).then(() => { const inp = $('chat-in'); if (inp) inp.focus(); });
  }

  statusInfo() {
    const p = this.player, w = this.world;
    if (p.current && p.current.id === 'stay') {
      const b = w.building(p.current.buildingId);
      // la clé change quand l'argent, le frigo ou l'énergie changent assez pour griser des boutons
      return { key: `stay:${b.id}:${Math.floor(p.money)}:${p.food}:${Math.floor(p.energy / 5)}:${p.rentDue}:${w.hour | 0}`, stay: b };
    }
    if (p.current) {
      const def = ACTIONS[p.current.id];
      const b = w.building(p.current.buildingId);
      return {
        key: `cur:${p.current.id}:${p.current.buildingId}`, icon: def.icon, title: def.label,
        sub: `${b ? b.name + ' · ' : ''}${dur(p.current.remaining)}`,
        progress: 1 - p.current.remaining / p.current.total, cancel: true,
      };
    }
    if (p.plan) {
      const def = ACTIONS[p.plan.id];
      const b = p.plan.buildingId != null ? w.building(p.plan.buildingId) : null;
      return {
        key: `plan:${p.plan.id}:${p.plan.buildingId}`, icon: '🚶',
        title: p.plan.id === 'goto' ? 'En marche' : `En route : ${def.label}`,
        sub: b ? b.name : '', cancel: true,
      };
    }
    if (p.routine) return { key: 'routine', icon: '🔁', title: 'Routine', sub: 'Ta routine choisit la prochaine activité.' };
    return { key: 'idle', icon: '🙂', title: 'Temps libre', sub: 'Touche un lieu, une rue ou une personne.' };
  }

  statusHTML(info) {
    return `<div class="box-head"><span class="ico">${info.icon}</span><b>${esc(info.title)}</b>
      ${info.cancel ? '<button class="box-close" data-cancel title="Arrêter">✕</button>' : ''}</div>
      <p class="sub">${esc(info.sub)}</p>
      ${info.progress != null ? `<div class="progress"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></div>` : ''}`;
  }

  onBoxClick(e) {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const w = this.world, p = this.player;
    if (btn.hasAttribute('data-close')) { this.closePanels(); return this.render(); }
    if (btn.hasAttribute('data-evclose')) { this.director.close(); this.evShown = null; return this.render(); }
    if (btn.hasAttribute('data-cancel')) { w.cancel(p); return this.render(); }
    if (btn.hasAttribute('data-leave')) { w.perform(p, 'leave'); return this.render(); }
    if (btn.hasAttribute('data-routine')) { $('b-routine').click(); return; }
    if (btn.hasAttribute('data-look')) { openCustomizer(); return; }
    if (btn.hasAttribute('data-join')) { this.join(this.person); return; }
    if (btn.hasAttribute('data-goobj')) { this.goToObject(this.object); return; }
    if (btn.dataset.gotoB != null) {
      const b = w.building(Number(btn.dataset.gotoB));
      if (state.scene && p.inside == null) state.scene.focusBuilding(b);
      return this.showPlace(b);
    }
    if (btn.dataset.person) {
      const t = w.actorById(btn.dataset.person);
      if (!t) return this.render();
      if (state.scene && t.outdoors && p.inside == null) state.scene.focusActor(t);
      return this.showPerson(t);
    }
    if (btn.dataset.topic) { this.converse(t => sendTopic(t, btn.dataset.topic)); return; }
    if (btn.dataset.pick != null) {
      const c = (this.chatChoices || [])[Number(btn.dataset.pick)];
      if (c) this.converse(t => sendChoice(t, c));
      return;
    }
    if (btn.dataset.offer != null) {
      const o = (this.chatOffers || [])[Number(btn.dataset.offer)];
      if (o && w.perform(p, o.action, o.params).ok) { this.chatOffers = []; this.closePanels(); }
      return this.render();
    }
    if (btn.closest('form')) return; // bouton d'envoi du chat : géré par le formulaire
    if (btn.dataset.choice != null) { this.director.choose(Number(btn.dataset.choice)); return; }
    if (btn.dataset.act) {
      const id = btn.dataset.act;
      const params = btn.dataset.p ? JSON.parse(btn.dataset.p) : {};
      const r = w.perform(p, id, params);
      // On garde les panneaux « personne » et « Ma vie » ouverts ; un lieu se referme quand on agit
      if (r.ok && (this.place || this.object)) { this.place = null; this.object = null; }
      this.render();
    }
  }

  // Aller retrouver quelqu'un : dans la rue, ou dans le lieu où il se trouve
  join(t) {
    const w = this.world, p = this.player;
    if (t.outdoors) w.perform(p, 'goto', { x: Math.round(t.px), y: Math.round(t.py) });
    else w.perform(p, 'enter', { building: t.inside });
    this.render();
  }
}
