import { ACTIONS, nextShiftText } from './sim/actions.js';
import { TYPES } from './map/types.js';
import { state } from './state.js';
import { openCustomizer } from './customize.js';
import { FURNITURE, furnById, comfortOf, COMFORT_CAP, MAX_FURNITURE } from './sim/furniture.js';
import { ensureAge, isBirthday } from './sim/calendar.js';
import { fmtShift, DAY_SHORT, MAX_WARNINGS, RAISE_EVERY, JOB_TITLES, openings, isWorkday, POSITIONS, CERTS, positionsOf, posOf, freeSlots, qualifies, bestPosition, expOf } from './sim/jobs.js';
import { rel, level, near } from './sim/social.js';
import { weeklyRent, occupants, LATE_EVICT } from './sim/housing.js';
import { freeUnits, isClosed, promo, dishOfDay, LOYALTY_EVERY } from './sim/city.js';
import { Sound } from './audio.js';
import { t, LANGS, tLines } from './i18n.js';
const tr = s => t(s); // (dans personHTML, « t » désigne la personne : on traduit avec tr)
// Texte bilingue écrit sur place (phrases avec nombres) et jours de la semaine
const L = (fr, en) => (settings().lang === 'en' ? en : fr);
const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayShort = d => (settings().lang === 'en' ? DAY_EN[d] : DAY_SHORT[d]);
import { GUIDE } from './guide.js';
import { icon } from './icons.js';
import { settings, setSetting, onSettings } from './settings.js';
import { isPolice, jailed } from './sim/safety.js';
import { SEASON_INFO } from './sim/world.js';
import { cityPulse } from './city/common.js';
import { TUTORIAL, TUT_REWARD, TUT_FINAL, DREAMS, tutStep, tutReady, dreamClaimable, nextDream, DAILY, DAILY_REWARD, DAILY_BONUS, dailyFor, levelOf, LEVELS, LEVEL_TITLES } from './sim/goals.js';
import { TAX_POLICIES, AID_POLICIES, CAMPAIGN_FEE, PROJECTS } from './sim/gov.js';
import { CATALOG } from './sim/catalog.js';
import { SAVINGS_RATE } from './sim/bank.js';
import { INCOME, SPEND } from './sim/budget.js';
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

// Couleur des boutons selon ce que fait l'action (repérage d'un coup d'œil)
const ACT_CAT = {};
const cat = (c, ids) => ids.forEach(id => { ACT_CAT[id] = c; });
cat('food', ['coffee', 'eat_cafe', 'eat_bakery', 'groceries', 'eat_home', 'crepe', 'market_buy']);
cat('work', ['work', 'overtime', 'apply', 'call_sick', 'quit_job', 'study']);
cat('rest', ['workout', 'yoga', 'watch_fish', 'play_games', 'play_piano', 'buy_furniture', 'sleep', 'nap', 'watch_tv', 'read_book', 'sit_bench', 'admire_statue', 'wish_fountain', 'feed_pigeons', 'dance', 'sleep_rough', 'sit_here', 'browse_books', 'water_plant', 'inspect']);
cat('food', ['vending_snack', 'drink_water']);
cat('social', ['wish_birthday', 'birthday_party', 'talk', 'joke', 'wave', 'gift', 'treat', 'stroll', 'lend', 'recommend', 'ask_tip', 'tip']);
cat('money', ['sell_furniture', 'pay_rent', 'rent_home', 'buy_home', 'buy', 'allocation', 'claim_goal', 'shopping', 'repair', 'scratch', 'brocante_hunt', 'use_vehicle', 'buy_umbrella']);
cat('civic', ['vote', 'run_mayor', 'set_policy', 'city_project', 'report', 'consult', 'enter', 'leave', 'goto', 'metro']);
cat('danger', ['steal', 'shoplift', 'burgle', 'arrest', 'extinguish', 'pay_fine']);

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
    $('b-routine').onclick = () => {
      player.routine = !player.routine; player.thinkIn = 0; this.syncControls(); this.refresh(true);
      if (player.routine) this.floatNote(t('⚠️ Routine : livré à lui-même, ton personnage peut mal tourner (vols, pots-de-vin, jeux, absences)…'));
    };
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
    // Paramètres (⚙️) : langue, sons, vibrations, astuces, taille du texte, économie de batterie
    $('b-settings').onclick = () => this.openSettings();
    $('box').addEventListener('input', e => { if (e.target.dataset.range) setSetting(e.target.dataset.range, Number(e.target.value)); });
    onSettings(k => { this.applySettings(); if (k === 'lang') { this.questKey = ''; this.render(); } });
    this.applySettings();
    this.applyIcons();
    this.watchLayout();
    document.addEventListener('click', e => { if (e.target.closest('button')) snd.click(); }, true);
    // Son des annonces selon leur importance : rien pour le banal (journal, saison, bonjour, faim…),
    // un petit « pop » pour une info, le carillon seulement pour ce qui compte vraiment
    const QUIET = new Set(['journal', 'salut', 'faim', 'fatigue', 'reveil', 'fete', 'tuyau', 'season']);
    const BIG = new Set(['hired', 'fired', 'laidOff', 'promoted', 'rentReminder', 'evicted', 'robbed', 'arrested', 'custody', 'verdict', 'jurySummons', 'released', 'bizClosed', 'electionResult', 'jobWarning']);
    world.on('event', inst => {
      const k = inst.kind || inst.id;
      if (QUIET.has(k)) return;
      if (BIG.has(k) || inst.id === 'incendie' || inst.id === 'malaise' || inst.id === 'retard') snd.chime();
      else snd.pop();
    });
    // Sons propres aux grands moments (en plus du carillon de l'événement)
    const SFX = { hired: 'hired', loyalty: 'sparkle', jaywalk: 'whistle', custody: 'whistle', verdict: 'gavel', released: 'unlock', raise: 'fanfare' };
    for (const [ev, fx] of Object.entries(SFX)) world.on(ev, e => { if (mine(e) && snd[fx]) setTimeout(() => snd[fx](), 180); });
    // erreurs : seulement quand c'est toi qui as demandé (pas la routine), et pas en rafale
    let lastErr = 0, lastCoin = 0;
    world.on('fail', e => { if (mine(e) && !this.player.routine && performance.now() - lastErr > 2500) { lastErr = performance.now(); snd.error(); } });
    world.on('done', e => {
      if (!mine(e)) return;
      if (e.id === 'claim_goal') snd.fanfare();
      else if (e.delta && e.delta.money >= 5 && performance.now() - lastCoin > 4000) { lastCoin = performance.now(); snd.coin(); }
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
    if (!settings().vibrate) return;
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(25);
  }

  // ---------- Bienvenue : 4 cartes pour comprendre le jeu en 30 secondes (une seule fois par appareil) ----------
  showWelcome(force = false) {
    if (!force && settings().welcomed) return;
    const SLIDES = [
      ['👋', 'Bienvenue dans World !', 'Tu viens d’emménager dans le Marais, à Paris. Travaille, fais-toi des amis, deviens propriétaire… ou même maire ! Chaque habitant vit sa propre vie.'],
      ['👆', 'Comment jouer', 'Touche la rue pour marcher, un bâtiment pour voir ce qu’on y fait, un habitant pour lui parler. Glisse pour bouger la carte, pince pour zoomer.'],
      ['⚡', 'Prends soin de toi', 'En haut : ton énergie, ta faim et ton moral. Dors, mange, détends-toi. À gauche : ton frigo, ton travail et ton logement.'],
      ['🎯', 'Tes objectifs', 'Suis les « Premiers pas » en haut à gauche, puis les objectifs du jour pour gagner de l’argent et de l’expérience. Le guide complet est dans ⚙️.'],
    ];
    let i = 0;
    const el = $('welcome');
    const draw = () => {
      const [ic, title, text] = SLIDES[i];
      el.innerHTML = `<div class="card"><div class="wic">${ic}</div><h2>${esc(t(title))}</h2><p>${esc(t(text))}</p>
        <div class="dots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="btns"><button data-wskip>${t('Passer')}</button><button class="main" data-wnext>${i < SLIDES.length - 1 ? t('Suivant') : t('C’est parti !')}</button></div></div>`;
    };
    el.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-wnext') && i < SLIDES.length - 1) { i++; return draw(); }
      el.classList.add('hidden'); setSetting('welcomed', true);
    };
    draw();
    el.classList.remove('hidden');
  }

  // Icônes dessinées (SVG) à la place des emojis : mêmes sur tous les appareils
  applyIcons() {
    const set = (el, n) => { if (el) el.innerHTML = icon(n); };
    const pillIcon = id => $(id) && $(id).closest('.pill').querySelector('span');
    set(document.querySelector('#hud .pill span'), 'clock');
    set(document.querySelector('#p-money span'), 'coin');
    set(pillIcon('v-energy'), 'bolt'); set(pillIcon('v-hunger'), 'food'); set(pillIcon('v-mood'), 'mood');
    set(pillIcon('v-food'), 'fridge'); set(document.querySelector('#p-job span'), 'briefcase');
    const B = { 'b-exit': 'door', 'b-center': 'target', 'b-map': 'map', 'b-people': 'people', 'b-routine': 'routine', 'b-look': 'shirt',
      'b-settings': 'gear', 'b-pause': 'pause', 'b-play': 'play', 'b-fast': 'fast', 'b-full': 'full' };
    for (const [id, n] of Object.entries(B)) set($(id), n);
  }

  // Mise en page qui s'adapte : les colonnes et la carte d'objectif se placent SOUS la barre du haut,
  // même quand elle passe sur deux lignes (petits écrans) → rien ne se chevauche
  watchLayout() {
    const apply = () => {
      const r = document.documentElement.style;
      const hud = $('hud').getBoundingClientRect(), q = $('quest').getBoundingClientRect();
      r.setProperty('--hud-b', `${Math.round(hud.bottom)}px`);
      r.setProperty('--ctl-b', `${Math.round($('controls').getBoundingClientRect().bottom)}px`);
      r.setProperty('--ctl-w', `${Math.round($('controls').getBoundingClientRect().width)}px`);
      r.setProperty('--dock-r', `${Math.round($('dock').getBoundingClientRect().right)}px`);
      // la fenêtre du bas s'arrête sous la carte d'objectif (elles ne se recouvrent jamais)
      r.setProperty('--quest-b', `${Math.round(q.height ? q.bottom : hud.bottom)}px`);
      if (state.interior && state.interior.building) state.interior.fitSoon();
    };
    apply();
    if (window.ResizeObserver) { const ro = new ResizeObserver(apply); for (const id of ['hud', 'controls', 'dock', 'quest', 'box']) ro.observe($(id)); }
    window.addEventListener('resize', apply);
  }

  // Petit message passager (bulle du haut)
  floatNote(msg) {
    const el = $('tip');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => { el.classList.remove('show'); this.tipOn = false; }, 2500);
  }

  // ---------- Paramètres ----------
  applySettings() {
    const s = settings();
    document.documentElement.lang = s.lang;
    document.body.classList.toggle('text-small', s.textSize === 'small');
    document.body.classList.toggle('text-large', s.textSize === 'large');
    const TITLES = { 'b-settings': 'Paramètres', 'b-map': 'Plan des lieux', 'b-people': 'Habitants', 'b-routine': 'Routine automatique',
      'b-look': 'Mon style', 'b-exit': 'Sortir dans la rue', 'b-center': 'Recentrer sur moi' };
    for (const [id, title] of Object.entries(TITLES)) if ($(id)) $(id).title = t(title);
    if (state.scene && state.scene.applySaver) state.scene.applySaver(s.saver);
  }

  // ---------- Fenêtre des paramètres : grande, en paysage, avec des onglets à gauche ----------
  openSettings(tab = this.setTab || 'general') {
    this.setTab = tab;
    const el = $('settings');
    el.innerHTML = this.settingsHTML();
    el.classList.remove('hidden');
    if (!el.onclick) {
      el.onclick = e => this.onSettingsClick(e);
      el.addEventListener('input', e => { if (e.target.dataset.range) setSetting(e.target.dataset.range, Number(e.target.value)); });
    }
  }

  closeSettings() { $('settings').classList.add('hidden'); }

  onSettingsClick(e) {
    if (e.target.id === 'settings') return this.closeSettings(); // toucher à côté : on ferme
    const btn = e.target.closest('button');
    if (!btn) return;
    const p = this.player;
    if (btn.hasAttribute('data-sclose')) return this.closeSettings();
    if (btn.hasAttribute('data-rewelcome')) { this.closeSettings(); return this.showWelcome(true); }
    if (btn.dataset.tab) return this.openSettings(btn.dataset.tab);
    if (btn.hasAttribute('data-sndtest')) { this.sound.start(); setTimeout(() => this.sound.fanfare(), 120); setTimeout(() => this.sound.sparkle(), 700); return; }
    if (btn.dataset.set) { setSetting(btn.dataset.set, !settings()[btn.dataset.set]); if (btn.dataset.set === 'sound' && settings().sound) this.sound.start(); }
    else if (btn.dataset.setk) {
      const v = btn.dataset.setv, changed = String(settings()[btn.dataset.setk]) !== v;
      setSetting(btn.dataset.setk, /^\d+$/.test(v) ? Number(v) : v);
      if (btn.dataset.setk === 'gfx' && changed) setTimeout(() => location.reload(), 150); // qualité graphique : on relance (la partie est sauvegardée en quittant)
    }
    else if (btn.hasAttribute('data-resettips')) { p.tips = []; this.tipAt = -1e9; this.floatNote(t('Les astuces réapparaîtront.')); }
    this.openSettings();
  }

  settingsHTML() {
    const s = settings();
    const sw = (key, label, icon) => this.choiceHTML(`data-set="${key}"`, icon, label, s[key] ? `✅ ${t('Activé')}` : `⬜ ${t('Coupé')}`, true);
    const chips = (key, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${String(s[key]) === String(v) ? 'on' : ''}" data-setk="${key}" data-setv="${v}">${esc(t(l))}</button>`).join('')}</div>`;
    const TABS = [['guide', '📖', 'Guide'], ['general', '🌍', 'Langue et affichage'], ['sound', '🔊', 'Son'], ['comfort', '📱', 'Confort'], ['battery', '🔋', 'Batterie']];
    const guide = (GUIDE[s.lang] || GUIDE.fr).map(([ic, title, text], i) => `<details ${i === 0 ? 'open' : ''}><summary><span>${ic}</span>${esc(title)}</summary><p>${esc(text).replace(/\n/g, '<br>')}</p></details>`).join('');
    const PAGES = {
      guide: `<h3>📖 ${t('Guide du jeu')}</h3><div class="choices">${this.choiceHTML('data-rewelcome class="c-rest"', '👋', 'Revoir l’accueil', '', true)}</div><div class="guide">${guide}</div>`,
      general: `<h3>🌍 ${t('Langue')}</h3>${chips('lang', LANGS)}
        
        <h3>🔠 ${t('Taille du texte')}</h3>${chips('textSize', [['small', 'Petit'], ['normal', 'Normal'], ['large', 'Grand']])}`,
      sound: `<div class="choices">${sw('sound', 'Son', '🔊')}</div>
        <div class="sliders">
          ${[['volume', '🔊', 'Volume général'], ['musVol', '🎻', 'Musique'], ['ambVol', '🌧️', 'Ambiances (ville, pluie, café)'], ['uiVol', '🔔', 'Sons de l’interface']].map(([k, ic, l]) =>
            `<label class="range"><span>${ic} ${esc(t(l))}</span><input type="range" min="0" max="1" step="0.05" value="${s[k] ?? 1}" data-range="${k}" oninput="this.nextElementSibling.textContent=Math.round(this.value*100)+' %'"><b>${Math.round((s[k] ?? 1) * 100)} %</b></label>`).join('')}
        </div>
        <div class="choices two">${sw('music', 'Musique', '🎻')}${sw('ambience', 'Ambiances (ville, pluie, café)', '🌧️')}${sw('uiSounds', 'Sons de l’interface', '🔔')}</div>
        <div class="choices">${this.choiceHTML('data-sndtest class="c-rest"', '🎵', 'Tester le son', '', true)}</div>`,
      comfort: `<h3>🎥 ${t('Caméra')}</h3>
          ${[['camRotate', '🔄', 'Rotation'], ['camZoom', '🔍', 'Zoom'], ['camPan', '✋', 'Déplacement']].map(([k, ic, l]) =>
            `<label class="range"><span>${ic} ${esc(t(l))}</span><input type="range" min="0.3" max="2" step="0.1" value="${s[k] ?? 1}" data-range="${k}" oninput="this.nextElementSibling.textContent=Math.round(this.value*100)+' %'"><b>${Math.round((s[k] ?? 1) * 100)} %</b></label>`).join('')}
        <h3>☝️ ${t('Un doigt')}</h3>${chips('oneFinger', [['rotate', 'Tourner la vue'], ['pan', 'Déplacer la vue']])}
        <div class="choices two">${sw('vibrate', 'Vibrations', '📳')}${sw('tips', 'Astuces', '💡')}</div>
        <h3>⏱️ ${t('Les événements s’effacent après')}</h3>${chips('eventTimer', [[8, '8 s'], [12, '12 s'], [25, '25 s'], [0, 'jamais']])}
        <div class="choices">${this.choiceHTML('data-resettips', '💡', 'Revoir les astuces', '', true)}</div>`,
      battery: `<h3>🖥️ ${t('Qualité graphique')}</h3>${chips('gfx', [['auto', 'Auto'], ['high', 'Haute'], ['medium', 'Moyenne'], ['low', 'Basse']])}<p>${t('Auto : le jeu s’adapte à ton appareil. Basse : plus fluide sur un appareil peu puissant. Le jeu redémarre (ta partie est sauvegardée).')}</p><p>${t('Haute au téléphone : 60 images/s, plus fluide et plus net, mais il chauffe davantage.')}</p>
        <p>${t('Moins de passants et de voitures ; résolution réduite au prochain lancement.')}</p>
        <div class="choices">${sw('saver', 'Économie de batterie', '🔋')}</div>`,
    };
    const tab = PAGES[this.setTab] ? this.setTab : 'general';
    return `<div class="card">
      <nav>${TABS.map(([id, ic, l]) => `<button class="${id === tab ? 'on' : ''}" data-tab="${id}"><span>${ic}</span>${esc(t(l))}</button>`).join('')}</nav>
      <section><div class="shead"><b>⚙️ ${t('Paramètres')}</b><button class="box-close" data-sclose title="${t('Fermer')}">✕</button></div>${PAGES[tab]}</section>
    </div>`;
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
    $('v-day').textContent = `${dayShort(w.weekday)} ${SEASON_INFO[w.season].icon} ${L(`An ${w.year}`, `Yr ${w.year}`)}`;
    const wx = w.weather === 'rain' ? 'rain' : w.weather === 'snow' ? 'snow' : w.weather === 'cloud' ? 'cloud' : w.isNight ? 'moon' : 'sun';
    if (wx !== this.wxIcon) { this.wxIcon = wx; $('v-weather').innerHTML = icon(wx); }
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
    const hic = p.housing === 'own' ? 'key' : 'home';
    if (hic !== this.homeIcon) { this.homeIcon = hic; $('v-homeic').innerHTML = icon(hic); }
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
    if (p.inside !== this.lastInside) { if (this.lastInside !== undefined) this.sound.door(); this.lastInside = p.inside; this.stayHidden = null; }
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
      return this.actBtn(id, o.params || {});
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
    let shownPlace = null;
    if (this.place) box.innerHTML = this.placeHTML(this.place);
    else if (this.life) box.innerHTML = this.lifeHTML();
    else if (this.panel === 'map') box.innerHTML = this.mapHTML();
    else if (this.panel === 'people') box.innerHTML = this.peopleHTML();
    else if (this.panel === 'settings') box.innerHTML = this.settingsHTML();
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
      box.innerHTML = info.stay ? (this.stayHidden === info.stay.id ? '' : this.placeHTML(info.stay, true)) : info.hidden ? '' : this.statusHTML(info);
      if (info.stay) shownPlace = info.stay;
    }
    box.classList.toggle('empty', !box.innerHTML.trim());
    if (this.place) shownPlace = this.place;
    // Fiche d'un lieu : fenêtre élargie en paysage (boutons en grille), couleur du type de lieu
    const mini = !!shownPlace && !this.place && shownPlace.type !== 'home' && !this.placeMore; // petite fiche dans un commerce
    box.classList.toggle('wide', !!shownPlace && !mini);
    box.classList.toggle('mini', mini);
    document.body.classList.toggle('wide-box', !!shownPlace); // la barre du bas à gauche se resserre
    box.dataset.theme = shownPlace ? shownPlace.type
      : this.life ? 'life' : this.panel ? this.panel : this.person ? 'person' : this.object ? 'object' : this.director.active ? 'event' : 'idle';
    if (pop) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }

  head(icon, title, close = true) {
    return `<div class="box-head"><span class="ico">${icon}</span><b>${esc(t(title))}</b>${close ? `<button class="box-close" data-close title="${t('Fermer')}">✕</button>` : ''}</div>`;
  }

  choiceHTML(attrs, icon, label, meta, check) {
    const off = check !== true;
    return `<button ${attrs} ${off ? 'disabled' : ''}><span>${icon}</span>
      <div class="lbl">${esc(t(label))}${off ? `<small>${esc(t(check))}</small>` : ''}</div>${meta ? `<em>${meta}</em>` : ''}</button>`;
  }

  // Bouton générique pour une action (avec paramètres) — icône personnalisable
  actBtn(id, params = {}, label = null, icon = null) {
    const def = ACTIONS[id], p = this.player;
    const attrs = `data-act="${id}" data-p="${esc(JSON.stringify(params))}" class="c-${ACT_CAT[id] || 'misc'}"`;
    return this.choiceHTML(attrs, icon || def.icon, label || def.label, this.meta(def, params), this.world.check(p, id, params));
  }

  // Articles en vente dans ce type de lieu
  shopHTML(b, inside) {
    const items = CATALOG.filter(i => i.shop === b.type);
    if (!items.length) return '';
    if (!inside) return `<p>${tr('🛍️ Entre pour voir les articles.')}</p>`;
    const p = this.player;
    let cat = '';
    const rows = items.map(it => {
      const head = it.cat !== cat ? `<div class="cat">${tr(cat = it.cat)}</div>` : '';
      if (!p.owned.includes(it.id)) return head + this.actBtn('buy', { item: it.id }, it.name, it.icon);
      if (it.vehicle) {
        return head + (p.vehicle === it.id
          ? this.choiceHTML('', it.icon, `${it.name} · utilisé`, '✓', true)
          : this.actBtn('use_vehicle', { item: it.id }, `Utiliser : ${it.name}`, it.icon));
      }
      return head + this.choiceHTML('data-look', it.icon, `${it.name} · à toi`, '👕', true);
    });
    return `<div class="sec"><b>${t('🛍️ Boutique')}</b><div class="choices">${rows.join('')}</div></div>`;
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
      return this.choiceHTML(`data-choice="${i}" class="c-${c.action ? ACT_CAT[c.action] || 'misc' : 'misc'}"`, c.icon, c.label, def ? this.meta(def, c.params) : '', this.director.check(c));
    }).join('');
    // ✕ en haut : fermer l'événement sans choisir
    const head = `<div class="box-head"><span class="ico">${ev.icon}</span><b>${esc(t(ev.title))}</b><button class="box-close ev-close" data-evclose title="${t('Fermer')}">✕</button></div>`;
    return `${head}<p>${esc(tLines(ev.text)).replace(/\n/g, '<br>')}</p><div class="choices">${buttons}</div><div class="evtimer"><i style="width:100%"></i></div>`;
  }

  // Panneau d'un lieu : vu de la rue (inside = false) ou depuis l'intérieur.
  placeHTML(b, inside = false) {
    const p = this.player, w = this.world;
    const buttons = [];
    if (!inside) buttons.push(this.actBtn('enter', { building: b.id }));
    // Ici même (pas dans le commerce du même type le plus proche)
    for (const id of Object.keys(ACTIONS)) if (!ACTIONS[id].custom && w.canDoAt(p, id, b)) buttons.push(this.actBtn(id, ACTIONS[id].place.type ? { at: b.id } : {}));

    // Emploi : le poste à pourvoir passe en premier (bandeau juste sous le titre)
    let note = '', jobTop = '';
    if (b.jobs && !(p.job && p.job.building === b.id)) {
      const n = openings(w, b);
      const title = JOB_TITLES[b.type] || 'Poste';
      jobTop = POSITIONS[b.type] ? this.jobsHTML(b) : `<div class="jobtop"><span>💼 ${esc(t(title))} · ${b.jobs.wage} €/h · ${n ? `${n} poste${n > 1 ? 's' : ''} libre${n > 1 ? 's' : ''}` : 'complet'}</span>${this.actBtn('apply', { building: b.id }, 'Postuler')}</div>`;
    } else if (p.job && p.job.building === b.id) {
      note = `<p>${L('Ton travail', 'Your job')} · ${fmtShift(p.job)} · ${p.job.days.map(d => dayShort(d)).join(' ')}</p>`;
      if (POSITIONS[b.type]) jobTop = this.jobsHTML(b); // évoluer ici : promotion
    }
    if (b.type === 'school') jobTop += this.trainHTML(b); // formations courtes

    // Logement
    if (b.type === 'home') {
      if (b.id === p.home) {
        note = `<p>${p.housing === 'own' ? L('Tu es propriétaire.', 'You own this place.') : L(`Locataire · ${weeklyRent(b)} €/semaine`, `Tenant · €${weeklyRent(b)}/week`)}</p>${this.furnHTML()}`;
        if (p.housing === 'rent') {
          if (p.rentDue > 0) buttons.push(this.actBtn('pay_rent'));
          buttons.push(this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`));
        }
      } else if (freeUnits(w, b) > 0) {
        const f = freeUnits(w, b);
        note = `<p>${L(`${f} appartement${f > 1 ? 's' : ''} libre${f > 1 ? 's' : ''} sur ${b.units} · ${weeklyRent(b)} €/semaine${occupants(w, b).length ? '' : ` ou ${money(b.price)} € à l’achat`}`, `${f} of ${b.units} apartment${f > 1 ? 's' : ''} free · €${weeklyRent(b)}/week${occupants(w, b).length ? '' : ` or €${money(b.price)} to buy`}`)}</p>`;
        buttons.push(this.actBtn('rent_home', { building: b.id }));
        if (!occupants(w, b).length) buttons.push(this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`));
      } else if (!inside) {
        note = `<p>${L(`Complet : ${b.units} appartement${b.units > 1 ? 's' : ''}, tous occupés.`, `Full: all ${b.units} apartment${b.units > 1 ? 's are' : ' is'} taken.`)}</p>`;
      }
      // La nuit, on peut tenter un cambriolage (très risqué)
      if (b.id !== p.home && occupants(w, b).length && (w.hour >= 23 || w.hour < 5)) buttons.push(this.actBtn('burgle', { building: b.id }));
    }

    // Services publics : un mot sur ce qu'on y fait
    const SERVICE = {
      police: () => { const s = w.safety ? w.safety.stats : { week: 0, arrests: 0 }; return L(`🚨 ${s.week} délit${s.week > 1 ? 's' : ''} cette semaine · ${s.arrests} arrestation${s.arrests > 1 ? 's' : ''} au total`, `🚨 ${s.week} crime${s.week > 1 ? 's' : ''} this week · ${s.arrests} arrest${s.arrests > 1 ? 's' : ''} in total`) + (p.wanted > 0 ? ` · <span class="bad">${L('tu es recherché·e !', 'you are wanted!')}</span>` : ''); },
      hospital: () => t(p.sick ? '🤧 Tu es malade : un médecin peut te soigner.' : '🩺 Consultations quand un soignant est de service.'),
      firestation: () => { const n = w.safety ? Object.keys(w.safety.fires).length : 0; return n ? L(`🔥 ${n} incendie${n > 1 ? 's' : ''} en cours !`, `🔥 ${n} fire${n > 1 ? 's' : ''} burning!`) : t('🚒 Aucun incendie. Les pompiers veillent.'); },
      prison: () => { const n = w.actors.filter(o => jailed(w, o)).length; return L(`⛓️ ${n} détenu${n > 1 ? 's' : ''}`, `⛓️ ${n} inmate${n > 1 ? 's' : ''}`); },
      school: () => L(`🎓 Ton niveau d’études : ${p.education ?? 1}/3 · cours du soir : 3 cours = 1 diplôme`, `🎓 Your education level: ${p.education ?? 1}/3 · evening classes: 3 classes = 1 diploma`),
      court: () => {
        const j = w.justice, s = j ? j.stats : { trials: 0, guilty: 0, acquitted: 0 };
        const next = w.actors.filter(o => o.trial).sort((x, y) => x.trial.at - y.trial.at)[0];
        const nx = next ? L(`<br>⚖️ Prochain procès : ${esc(next.isPlayer ? 'toi' : next.name)}, jour ${Math.floor(next.trial.at / 1440) + 1} à 10h`, `<br>⚖️ Next trial: ${esc(next.isPlayer ? 'you' : next.name)}, day ${Math.floor(next.trial.at / 1440) + 1} at 10:00`) : '';
        return L(`⚖️ ${s.trials} procès · ${s.guilty} condamnation${s.guilty > 1 ? 's' : ''} · ${s.acquitted} relaxe${s.acquitted > 1 ? 's' : ''}`, `⚖️ ${s.trials} trial${s.trials > 1 ? 's' : ''} · ${s.guilty} conviction${s.guilty > 1 ? 's' : ''} · ${s.acquitted} acquittal${s.acquitted > 1 ? 's' : ''}`) + nx;
      },
      bank: () => L(`🏦 En poche : ${money(Math.round(p.money))} € · épargne : ${money(Math.round(p.bank || 0))} € (+${SAVINGS_RATE * 100} %/sem.)${p.loan > 0 ? ` · prêt : ${money(Math.round(p.loan))} €` : ''}`,
        `🏦 Cash: €${money(Math.round(p.money))} · savings: €${money(Math.round(p.bank || 0))} (+${SAVINGS_RATE * 100}%/wk)${p.loan > 0 ? ` · loan: €${money(Math.round(p.loan))}` : ''}`),
    };
    if (SERVICE[b.type]) note = `${note}<p>${SERVICE[b.type]()}</p>`;
    if (w.safety && w.safety.burning(b.id)) note = `<p class="status bad">${L('🔥 En feu ! Personne ne peut entrer.', '🔥 On fire! Nobody can go in.')}</p>${note}`;
    // Commerce : ouvert seulement s'il y a quelqu'un au comptoir
    if (['cafe', 'bakery', 'shop', 'fashion', 'garage', 'cityhall', 'hospital', 'school', 'court', 'bank'].includes(b.type)) {
      const s = sellerAt(w, b, p);
      let status;
      if (s) status = L(`🟢 Ouvert · ${esc(s.name)} au comptoir`, `🟢 Open · ${esc(s.name)} at the counter`);
      else {
        const n = nextOpening(w, b);
        const hh = !n ? 0 : Math.floor((n.start % 1440) / 60);
        const when = !n ? '' : n.day === w.day ? L(`aujourd’hui à ${hh}h`, `today at ${hh}:00`) : L(`${DAY_SHORT[weekdayOf(n.day)]} à ${hh}h`, `${dayShort(weekdayOf(n.day))} at ${hh}:00`);
        status = L(`🔴 Fermé${when ? ` · ouvre ${when}` : ''}`, `🔴 Closed${when ? ` · opens ${when}` : ''}`);
      }
      // Santé du commerce (ville vivante) : fréquentation et prix
      const biz = w.city && w.city.biz[b.id];
      let life = '';
      if (biz && biz.closed) {
        status = L(`🔒 Fermé définitivement · un repreneur arrive ${biz.reopenDay - w.day <= 1 ? 'demain' : `dans ${biz.reopenDay - w.day} jours`}`, `🔒 Closed for good · new owner ${biz.reopenDay - w.day <= 1 ? 'tomorrow' : `in ${biz.reopenDay - w.day} days`}`);
      } else if (biz && biz.hist.length) {
        const avg = biz.hist.reduce((t, d) => t + d.n, 0) / biz.hist.length;
        const mood = t(avg >= 12 ? '🔥 Bondé' : avg >= 5 ? '🙂 Bonne clientèle' : avg >= 2 ? '😐 Calme' : '⚠️ Presque vide');
        const price = biz.price === 1 ? t('prix normaux') : biz.price > 1 ? L(`prix +${Math.round((biz.price - 1) * 100)} %`, `prices +${Math.round((biz.price - 1) * 100)}%`) : L(`promos −${Math.round((1 - biz.price) * 100)} %`, `discounts −${Math.round((1 - biz.price) * 100)}%`);
        life = `<p>${mood} · ${Math.round(avg * 10) / 10} ${L('clients/jour', 'customers/day')} · ${price}</p>`;
      }
      note = `<p class="status">${status}</p>${life}${note}`;
    }

    // Tout en bas : sortir (bouton pleine largeur)
    let leave = '';
    if (inside) {
      if (!note) note = `<p>${t('Touche un meuble ou une personne.')}</p>`;
      leave = `<div class="leave">${this.choiceHTML('data-leave class="c-civic"', '🚶', b.type === 'home' ? 'Sortir dans la rue' : ['cafe', 'bakery', 'shop', 'fashion', 'garage'].includes(b.type) ? 'Sortir de la boutique' : 'Sortir', '', true)}</div>`;
    }
    const icon = b.type === 'home' && b.id === p.home ? (p.housing === 'own' ? '🔑' : '🏠') : TYPES[b.type].icon;
    // À l'intérieur d'un commerce ou d'un service : petite fiche (nom, emploi, qui travaille) pour bien voir la pièce ;
    // les gestes se font en touchant les meubles, ou via « ⋯ Plus » qui déplie la fiche complète
    if (inside && b.type !== 'home') {
      const more = this.choiceHTML('data-more class="c-misc"', this.placeMore ? '▴' : '⋯', this.placeMore ? 'Moins' : L(`Plus (${buttons.length} actions)`, `More (${buttons.length} actions)`), '', true);
      if (!this.placeMore) return `${this.head(icon, b.name)}${this.miniPlaceHTML(b)}<div class="mini-row">${leave}</div><p class="mini-hint">${t('👆 Touche le comptoir ou un meuble pour agir')}</p>`;
      return `${this.head(icon, b.name)}${jobTop}${note}<div class="choices">${buttons.join('')}</div>${this.shopHTML(b, inside)}${b.type === 'cityhall' ? this.govHTML(b, inside) : ''}<div class="mini-row">${more}${leave}</div>`;
    }
    return `${this.head(icon, b.name)}${jobTop}${note}<div class="choices">${buttons.join('')}</div>${this.shopHTML(b, inside)}${b.type === 'cityhall' ? this.govHTML(b, inside) : ''}${leave}`;
  }

  // Petite fiche d'un lieu vu de l'intérieur : l'emploi et qui travaille ici
  miniPlaceHTML(b) {
    const p = this.player, w = this.world;
    const staff = w.actors.filter(o => o !== p && o.inside === b.id && (o.doing === 'work' || o.doing === 'overtime'));
    // 1. Ouvert / fermé, avec l'heure (fin du service le plus tardif aujourd'hui, ou prochaine ouverture)
    let status;
    if (staff.length) {
      const d0 = (w.day - 1) * 1440;
      // fermeture = fin du dernier service du jour, toutes équipes confondues (matin et soir)
      const crew = w.actors.filter(o => o.job && o.job.building === b.id && !o.job.street && isWorkday(o.job, w.day));
      const end = Math.max(...(crew.length ? crew : staff).map(o => (o.job ? d0 + (o.job.start + o.job.hours) * 60 : 0)));
      const h = Math.floor((end % 1440) / 60);
      status = `<div class="mp-status on">${L(`Ouvert · ferme à ${h}h`, `Open · closes at ${h}:00`)}</div>`;
    } else {
      const n = nextOpening(w, b);
      const hh = n ? Math.floor((n.start % 1440) / 60) : null;
      status = `<div class="mp-status off">${n ? L(`Fermé · ouvre ${n.day === w.day ? '' : 'demain '}à ${hh}h`, `Closed · opens ${n.day === w.day ? '' : 'tomorrow '}at ${hh}:00`) : L('Fermé', 'Closed')}</div>`;
    }
    // 2. Le poste (ou ton propre travail ici)
    let job = '';
    if (p.job && p.job.building === b.id) {
      job = `<div class="mp-job mine"><span class="mp-ic">${icon('briefcase')}</span><div><b>${L('Ton travail', 'Your job')}</b><small>${fmtShift(p.job)} · ${p.job.days.map(d => dayShort(d)).join(' ')}</small></div></div>`;
    } else if (b.jobs) {
      job = this.jobsHTML(b);
    }
    if (p.job && p.job.building === b.id && POSITIONS[b.type]) job += this.jobsHTML(b);
    if (b.type === 'school') job += this.trainHTML(b);
    // 3. Qui est là : pastilles de couleur (la couleur de leur tenue), on les touche pour leur parler
    const hex = c => '#' + (c ?? 0x7a6f96).toString(16).padStart(6, '0');
    const people = staff.length
      ? `<div class="mp-staff">${staff.map(o => `<button data-person="${o.id}" class="mp-who"><i style="background:${hex(o.look && o.look.body)}">${esc(o.name[0])}</i>${esc(o.name)}</button>`).join('')}</div>`
      : '';
    const pr = promo(w, b.id), dish = dishOfDay(w, b);
    const loyal = b.jobs && ['cafe', 'bakery', 'shop', 'fashion', 'garage'].includes(b.type) ? ((p.loyalty && p.loyalty[b.id]) || 0) % LOYALTY_EVERY : null;
    const extras = [
      pr ? `<span class="mp-chip promo">🏷️ ${esc(t(pr.label))}</span>` : '',
      dish ? `<span class="mp-chip dish">${b.type === 'cafe' ? '🍲' : '🥐'} ${esc(t(b.type === 'cafe' ? 'Plat du jour' : 'Spécialité'))} : ${esc(t(dish))}</span>` : '',
      loyal != null ? `<span class="mp-chip loyal" title="${esc(t('Carte de fidélité'))}">⭐ ${'★'.repeat(loyal)}${'☆'.repeat(LOYALTY_EVERY - 1 - loyal)} 🎁</span>` : '',
      // santé du commerce (économie) : on voit qui marche et qui est en difficulté
      (() => { const h = w.economy && w.economy.health(b.id); return h === 'good' ? `<span class="mp-chip biz-good">📈 ${esc(t('Les affaires marchent'))}</span>` : h === 'bad' ? `<span class="mp-chip biz-bad">📉 ${esc(t('En difficulté'))}</span>` : ''; })(),
    ].join('');
    return `<div class="mini-place">${status}${extras ? `<div class="mp-chips">${extras}</div>` : ''}${job}${people}</div>`;
  }

  // Postes d'un lieu : intitulé, salaire, places, conditions (vert = rempli, rouge = manquant).
  // On touche une ligne pour la choisir, un seul bouton « Postuler » (ou « Demander une promotion »).
  jobsHTML(b) {
    const p = this.player, w = this.world;
    const list = positionsOf(b);
    if (!list.length) return '';
    const mine = p.job && p.job.building === b.id ? posOf(w, p.job) : null;
    const bonus = w.economy ? w.economy.wageBonus(b.id) : 0;
    this.selPos = this.selPos || {};
    const best = bestPosition(w, p, b);
    let sel = list.find(x => x.id === this.selPos[b.id]) || best || list.find(x => freeSlots(w, b, x.id) > 0) || list[0];
    const rows = list.map(pos => {
      const free = freeSlots(w, b, pos.id), isMine = mine && mine.id === pos.id;
      const req = [];
      const edu = pos.edu ?? (b.jobs.edu || 0);
      if (edu) req.push([edu <= (p.education ?? 1), `🎓 ${L(`niv. ${edu}`, `lvl ${edu}`)}`]);
      if (pos.cert) req.push([(p.certs || []).includes(pos.cert), `📜 ${t(CERTS[pos.cert].name)}`]);
      if (pos.exp) req.push([expOf(w, p, b.type) >= pos.exp, `⏳ ${L(`${pos.exp} j d’expérience`, `${pos.exp} days’ experience`)}`]);
      const reqs = req.length ? req.map(([ok, txt]) => `<i class="${ok ? 'ok' : 'no'}">${esc(txt)}</i>`).join('') : `<i class="ok">${t('Ouvert à tous')}</i>`;
      const state = isMine ? `<em class="me">${t('ton poste')}</em>` : free ? `<em class="free">${L(`${free} libre${free > 1 ? 's' : ''}`, `${free} open`)}</em>` : `<em class="full">${t('pris')}</em>`;
      return `<button class="mp-pos${pos === sel ? ' sel' : ''}" data-pos="${pos.id}" data-pb="${b.id}"><span><b>${esc(t(pos.title))}</b> · ${pos.wage + (isMine ? 0 : bonus)} €/h ${state}</span><span class="req">${reqs}</span></button>`;
    }).join('');
    const promo = mine && sel.wage > p.job.wage;
    const btn = mine && !promo ? '' : this.actBtn('apply', { building: b.id, pos: sel.id }, mine ? 'Demander une promotion' : 'Postuler');
    const head = `<div class="mp-poshead">${icon('briefcase')} <b>${t(mine ? 'Évoluer ici' : 'Postes')}</b>${bonus ? `<small>${L(`+${bonus} €/h à l’embauche (on recrute !)`, `+€${bonus}/h signing bonus`)}</small>` : ''}</div>`;
    return `<div class="mp-posts">${head}${rows}${btn ? `<div class="mp-posbtn">${btn}</div>` : ''}</div>`;
  }

  // Meubler son logement : confort, meubles à toi (revendre), catalogue (livré tout de suite)
  furnHTML() {
    const p = this.player, w = this.world;
    const mine = p.furniture || [];
    const head = `<div class="mp-poshead">🛋️ <b>${t('Meubler')}</b><small>${L(`Confort ${comfortOf(p)}/${COMFORT_CAP} · ${mine.length}/${MAX_FURNITURE} meubles`, `Comfort ${comfortOf(p)}/${COMFORT_CAP} · ${mine.length}/${MAX_FURNITURE} items`)}</small></div>`;
    const toggle = this.choiceHTML('data-furn class="c-rest"', this.furnOpen ? '▴' : '🛋️', this.furnOpen ? 'Fermer le catalogue' : 'Catalogue de meubles', '', true);
    if (!this.furnOpen) return `<div class="mp-posts">${head}<p class="mini-hint">${t('Plus de confort = le moral remonte quand tu es chez toi, et de nouvelles activités.')}</p><div class="choices">${toggle}</div></div>`;
    const owned = mine.map((f, i) => { const it = furnById(f.id); return it ? this.actBtn('sell_furniture', { idx: i }, `${t('Revendre')} : ${t(it.name)} (+${Math.round(it.price * 0.4)} €)`, it.icon) : ''; }).join('');
    const shop = FURNITURE.map(it => this.actBtn('buy_furniture', { item: it.id }, `${t(it.name)} · ${L(`confort +${it.comfort}`, `comfort +${it.comfort}`)}${it.actions ? ' · ' + it.actions.map(a => ACTIONS[a] ? ACTIONS[a].icon : '').join('') : ''}`, it.icon)).join('');
    return `<div class="mp-posts">${head}<div class="choices">${toggle}${shop}</div>${owned ? `<div class="cat">${t('Chez toi')}</div><div class="choices">${owned}</div>` : ''}</div>`;
  }

  // École : formations courtes (une ligne par formation, un seul bouton)
  trainHTML(b) {
    const p = this.player, w = this.world;
    this.selCert = this.selCert || Object.keys(CERTS).find(id => !(p.certs || []).includes(id)) || 'secourisme';
    const rows = Object.entries(CERTS).map(([id, c]) => {
      const has = (p.certs || []).includes(id);
      const opens = Object.entries(POSITIONS).flatMap(([, list]) => list.filter(x => x.cert === id).map(x => t(x.title)));
      return `<button class="mp-pos${id === this.selCert ? ' sel' : ''}" data-cert="${id}"><span><b>${esc(t(c.name))}</b> · ${Math.round(c.cost * (w.economy ? w.economy.cpi : 1))} € ${has ? `<em class="me">✓ ${t('obtenu')}</em>` : ''}</span><span class="req"><i class="${(c.edu || 0) <= (p.education ?? 1) ? 'ok' : 'no'}">${c.edu ? `🎓 ${L(`niv. ${c.edu}`, `lvl ${c.edu}`)}` : t('Ouvert à tous')}</i><i class="ok">→ ${esc([...new Set(opens)].slice(0, 2).join(', '))}</i></span></button>`;
    }).join('');
    return `<div class="mp-posts"><div class="mp-poshead">📜 <b>${t('Formations (3 h)')}</b></div>${rows}<div class="mp-posbtn">${this.actBtn('train', { at: b.id, cert: this.selCert }, 'Suivre la formation')}</div></div>`;
  }

  // Mairie : le maire, la politique, les caisses, les élections (vote, candidature), les décisions du maire
  govHTML(b, inside) {
    const w = this.world, g = w.gov, p = this.player;
    if (!g) return '';
    const m = g.mayorActor;
    const lines = [
      `👤 ${L('Maire', 'Mayor')} : <b>${m ? esc(m.isPlayer ? `${m.name} (${L('toi', 'you')})` : m.name) : 'vacant'}</b>`,
      `${TAX_POLICIES[g.tax].icon} ${t(TAX_POLICIES[g.tax].label)} · ${AID_POLICIES[g.aid].icon} ${t(AID_POLICIES[g.aid].label)} (${L(`${g.aidAmount} €/semaine`, `€${g.aidAmount}/week`)})`,
      L(`🏦 Trésor public : ${money(Math.round(w.treasury || 0))} € · aides versées : ${money(g.aidPaid)} €`, `🏦 Treasury: €${money(Math.round(w.treasury || 0))} · welfare paid: €${money(g.aidPaid)}`),
    ];
    // Où vont les impôts : le budget de la semaine dernière (recettes / dépenses)
    const bl = w.budget && w.budget.last;
    if (bl) {
      const part = (dict, k) => (bl[k] ? `${t(dict[k])} : ${money(Math.round(bl[k]))} €` : null);
      const inc = Object.keys(INCOME).map(k => part(INCOME, k)).filter(Boolean);
      const out = Object.keys(SPEND).map(k => part(SPEND, k)).filter(Boolean);
      const bal = bl.income - bl.spend;
      lines.push(`<b>${L('📊 Budget de la semaine dernière', '📊 Last week’s budget')}</b>`,
        `➕ ${L('Recettes', 'Income')} ${money(bl.income)} € · ${inc.join(' · ')}`,
        `➖ ${L('Dépenses', 'Spending')} ${money(bl.spend)} € · ${out.join(' · ')}`,
        bal >= 0 ? L(`✅ Excédent : ${money(bal)} €`, `✅ Surplus: €${money(bal)}`) : `<span class="bad">${L(`⚠️ Déficit : ${money(-bal)} €`, `⚠️ Deficit: €${money(-bal)}`)}</span>`);
    } else {
      lines.push(L('📊 Premier bilan du budget lundi prochain.', '📊 First budget report next Monday.'));
    }
    if (g.austerity) lines.push(`<span class="bad">${L('⚠️ Austérité : caisses vides, services publics au ralenti', '⚠️ Austerity: empty coffers, public services slowed down')}</span>`);
    const rows = [];
    if (g.campaignOpen && g.candidates.length) {
      lines.push(g.votingOpen ? L(`🗳️ <b>Vote en cours</b> jusqu’au jour ${g.election}`, `🗳️ <b>Voting in progress</b> until day ${g.election}`) : L(`🗳️ Campagne : vote du jour ${g.election - 2} au jour ${g.election}`, `🗳️ Campaign: voting from day ${g.election - 2} to day ${g.election}`));
      for (const id of g.candidates) {
        const c = w.actorById(id);
        if (!c) continue;
        rows.push(this.actBtn('vote', { for: id }, `Voter ${c.isPlayer ? 'pour toi' : c.name}${id === g.mayor ? ' (sortant)' : ''}`));
      }
    } else {
      lines.push(L(`🗳️ Prochaines élections : jour ${g.election} (candidatures 5 jours avant)`, `🗳️ Next elections: day ${g.election} (candidacies 5 days before)`));
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
    return `<div class="sec"><b>${t('🏛️ La mairie')}</b><p>${lines.join('<br>')}</p><div class="choices">${rows.join('')}</div></div>`;
  }

  // « Ma vie » : contrat, logement, routine
  lifeHTML() {
    const p = this.player, w = this.world;
    ensureAge(p);
    const SN = { printemps: ['printemps', 'spring'], ete: ['été', 'summer'], automne: ['automne', 'autumn'], hiver: ['hiver', 'winter'] };
    const bdSeason = ['printemps', 'ete', 'automne', 'hiver'][Math.floor((p.birthday - 1) / 14)], bdDay = ((p.birthday - 1) % 14) + 1;
    const ageLine = `<div class="sec"><b>🎂 ${L(`${p.age} ans`, `${p.age} years old`)}${isBirthday(w, p) ? L(' · c’est ton anniversaire !', ' · it’s your birthday!') : ''}</b><p>${L(`Anniversaire : ${bdDay}e jour du ${SN[bdSeason][0]}`, `Birthday: day ${bdDay} of ${SN[bdSeason][1]}`)} · ${L(`An ${w.year}, jour ${w.dayOfYear}/56`, `Year ${w.year}, day ${w.dayOfYear}/56`)}${p.retired ? L(' · à la retraite', ' · retired') : ''}</p></div>`;
    let job;
    if (p.job) {
      const b = w.building(p.job.building);
      const warn = p.job.warnings ? '⚠️'.repeat(p.job.warnings) : L('aucun', 'none');
      const raiseIn = RAISE_EVERY - (p.job.streak % RAISE_EVERY), taxP = Math.round(taxRate(p.job.wage) * 100), taxW = Math.round(p.taxWeek || 0);
      job = `<div class="sec"><b>💼 ${esc(b.name)}</b><p>${t(jobTitle(w, p.job))} · ${L(`${p.job.wage} €/h`, `€${p.job.wage}/h`)}<br>
        ${fmtShift(p.job)} · ${p.job.days.map(d => dayShort(d)).join(' ')}<br>
        ${L('Prochain service', 'Next shift')} : ${t(nextShiftText(p, w) || '—')}<br>
        ${L('Avertissements', 'Warnings')} : ${warn} (${p.job.warnings}/${MAX_WARNINGS})<br>
        🎓 ${L('Niveau d’études', 'Education level')} : ${p.education ?? 1}/3<br>
        ${L(`Augmentation dans ${raiseIn} jour(s) sans faute`, `Raise in ${raiseIn} day(s) without fault`)}<br>
        🏛️ ${L(`Impôt prélevé à la source : ${taxP} % · ${taxW} € cette semaine`, `Income tax withheld: ${taxP}% · €${taxW} this week`)}</p>
        <div class="choices">${isWorkday(p.job, w.day) ? this.actBtn('call_sick') : ''}${this.actBtn('quit_job')}</div></div>`;
    } else {
      job = `<div class="sec"><b>${t('💼 Sans emploi')}</b><p>${t('Touche un commerce ou un bureau pour postuler, ou demande des tuyaux à tes connaissances.')}</p></div>`;
    }
    // Carrière : diplôme, formations, expérience par métier (ce qui ouvre les postes qualifiés)
    {
      const certs = (p.certs || []).map(id => CERTS[id] ? t(CERTS[id].name) : id);
      const exp = Object.entries(p.exp || {}).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1])
        .map(([type, d]) => `${t(JOB_TITLES[type] || type)} : ${L(`${d} j`, `${d} d`)}`);
      job += `<div class="sec"><b>📈 ${t('Ma carrière')}</b><p>🎓 ${L('Diplôme', 'Diploma')} : ${L(`niveau ${p.education ?? 1}/3`, `level ${p.education ?? 1}/3`)}<br>
        📜 ${L('Formations', 'Courses')} : ${certs.length ? esc(certs.join(', ')) : t('aucune (à l’école)')}<br>
        ⏳ ${L('Expérience', 'Experience')} : ${exp.length ? esc(exp.join(' · ')) : t('pas encore')}<br>
        💪 ${L('Forme physique', 'Fitness')} : ${Math.round(p.fitness || 0)}/100 ${t('(salle de sport)')}<br>
        🛋️ ${L('Confort chez toi', 'Home comfort')} : ${comfortOf(p)}/${COMFORT_CAP}</p></div>`;
    }

    let home;
    if (p.home != null) {
      const b = w.building(p.home);
      if (p.housing === 'own') {
        home = `<div class="sec"><b>🔑 ${esc(b.name)}</b><p>${L(`Tu es propriétaire : plus de loyer.<br>🏛️ Taxe foncière : ${Math.round(b.price * PROPERTY_TAX)} € par semaine (le lundi)`, `You own it: no more rent.<br>🏛️ Property tax: €${Math.round(b.price * PROPERTY_TAX)} per week (on Monday)`)}</p></div>`;
      } else {
        const due = p.rentDue > 0
          ? `<br><span class="bad">${L(`À payer : ${p.rentDue} €${p.rentLate ? ` · ${p.rentLate} j de retard (expulsion à ${LATE_EVICT} j)` : ''}`, `Due: €${p.rentDue}${p.rentLate ? ` · ${p.rentLate} days late (eviction at ${LATE_EVICT})` : ''}`)}</span>`
          : `<br>${t('Loyer à jour ✓')}`;
        home = `<div class="sec"><b>🏠 ${esc(b.name)}</b><p>${L(`Locataire · ${weeklyRent(b)} €/semaine, à payer chaque lundi`, `Tenant · €${weeklyRent(b)}/week, due every Monday`)}${due}</p>
          <div class="choices">${p.rentDue > 0 ? this.actBtn('pay_rent') : ''}${this.actBtn('buy_home', { building: b.id }, `Acheter (${money(b.price)} €)`)}</div></div>`;
      }
    } else {
      home = `<div class="sec"><b>${t('🏠 Sans logement')}</b><p>${t('Loue un logement libre (touche-le sur la carte) ou dors au Métro Saint-Paul.')}</p></div>`;
    }

    const vehicles = CATALOG.filter(i => i.vehicle && p.owned.includes(i.id));
    const ride = vehicles.length
      ? `<div class="sec"><b>${t('🚲 Déplacements')}</b><div class="choices">${
        this.actBtn('use_vehicle', { item: null }, 'Marcher', '🚶')}${vehicles.map(v => this.actBtn('use_vehicle', { item: v.id }, v.name, v.icon)).join('')}</div></div>`
      : `<div class="sec"><b>${t('🚲 Déplacements')}</b><p>${t('À pied. Vélos, scooters et voitures au Garage Roue Libre.')}</p></div>`;

    const clean = w.city ? Math.round(w.city.cleanliness) : 100;
    const cash = `<div class="sec"><b>${t('🏦 Mon argent')}</b><p>${L(`En poche : ${money(Math.round(p.money))} € · épargne à la banque : ${money(Math.round(p.bank || 0))} €`, `Cash: €${money(Math.round(p.money))} · bank savings: €${money(Math.round(p.bank || 0))}`)}${p.loan > 0 ? `<br>${L(`Prêt à rembourser : ${money(Math.round(p.loan))} € (prélevé le lundi)`, `Loan to repay: €${money(Math.round(p.loan))} (taken on Monday)`)}` : ''}
      <br>${L(`🗑️ Propreté du quartier : ${clean} %`, `🗑️ Neighbourhood cleanliness: ${clean}%`)}${p.trial ? `<br><span class="bad">${L(`⚖️ Procès jour ${Math.floor(p.trial.at / 1440) + 1} à 10h${p.trial.lawyer != null ? ' · avocat·e engagé·e' : ''}`, `⚖️ Trial on day ${Math.floor(p.trial.at / 1440) + 1} at 10:00${p.trial.lawyer != null ? ' · lawyer hired' : ''}`)}</span>` : ''}</p>
      ${p.trial && p.trial.lawyer == null ? `<div class="choices">${this.actBtn('hire_lawyer')}</div>` : ''}</div>`;
    const routine = `<div class="sec"><b>${t('🔁 Routine automatique')}</b><p>${t('Ton personnage mange, dort et va travailler tout seul. Tu peux toujours reprendre la main.')}<br><span class="bad">${t('⚠️ Mais livré à lui-même, il peut mal tourner : vols, pots-de-vin, jeux d’argent, jours d’absence… Plus souvent mal que bien !')}</span></p>
      <div class="choices">${this.choiceHTML('data-routine', p.routine ? '⏹️' : '▶️', p.routine ? 'Désactiver la routine' : 'Activer la routine', '', true)}</div></div>`;
    return `${this.head('📋', 'Ma vie')}${ageLine}${this.dreamsHTML()}${job}${home}${cash}${ride}${routine}`;
  }

  // ---------- Objectifs : rêves (dans « Ma vie ») et carte d'objectif ----------
  dreamsHTML() {
    const p = this.player, w = this.world;
    if (tutStep(p)) return `<div class="sec"><b>🌟 ${t('Mes rêves')}</b><p>${t('Termine d’abord tes premiers pas (en haut à gauche) : tes rêves se débloquent ensuite.')}</p></div>`;
    const rows = DREAMS.map(d => {
      const [c, m] = d.progress(p, w);
      const got = p.goals.claimed[d.id];
      const pct = Math.min(100, (c / m) * 100);
      const val = m > 1 ? ` · ${money(Math.min(c, m))}/${money(m)}` : '';
      if (!got && c >= m) return this.actBtn('claim_goal', { goal: d.id }, `${d.label} : récupérer ${d.reward.money ? `+${d.reward.money} €` : 'ta récompense'}`, d.icon);
      return `<div class="dream ${got ? 'ok' : ''}"><span class="ic">${d.icon}</span><div class="nm">${esc(t(d.label))}${got ? ' ✓' : val}
        ${got ? '' : `<div class="qbar"><i style="width:${pct.toFixed(0)}%"></i></div>`}</div></div>`;
    });
    const n = DREAMS.filter(d => p.goals.claimed[d.id]).length;
    const xp = p.goals.xp || 0, lv = levelOf(xp), nx = LEVELS[lv + 1];
    const level = `<div class="sec"><b>⭐ ${t('Niveau')} ${lv + 1} · ${esc(t(LEVEL_TITLES[lv]))}</b><p>${xp} XP${nx ? ` · ${t('prochain niveau à')} ${nx} XP` : ''} — ${t('les objectifs du jour, les rêves et les premiers pas font gagner de l’expérience.')}</p></div>`;
    return `${level}<div class="sec"><b>🌟 ${t('Mes rêves')} · ${n}/${DREAMS.length}</b><div class="choices">${rows.join('')}</div></div>`;
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
      html = `<div class="qh"><span>🎯</span>${t('Premiers pas')}<em>${p.goals.tut + 1}/${TUTORIAL.length}</em></div>
        <div class="qt"><span>${step.icon}</span>${esc(t(step.text))}${ready ? ' ✓' : ''}</div>
        ${ready ? '' : `<div class="qhint">${esc(t(step.hint))}</div>`}
        <div class="qbtns ${ready ? 'keep' : ''}">${ready ? `<button class="go" data-claim="tut">${t('🎁 Récupérer')} +${gain} €</button>` : `<button data-show="${step.target}">${t('👀 Montrer')}</button>`}</div>`;
    } else {
      // Après les premiers pas : les 3 objectifs du jour + le niveau de vie ; un rêve atteint passe devant
      const dream = DREAMS.find(d => dreamClaimable(p, w, d));
      const d = dailyFor(p, w);
      const xp = p.goals.xp || 0, lv = levelOf(xp);
      const next = LEVELS[lv + 1], prev = LEVELS[lv];
      const lvTxt = `⭐ ${t('Niv.')} ${lv + 1}`;
      const lines = d.picks.map(id => {
        const def = DAILY.find(x => x.id === id);
        const prog = d.progress[id] || 0, ok = prog >= def.need, got = d.claimed[id];
        const right = got ? '✅' : ok ? `<button class="go" data-dclaim="${id}">🎁 +${DAILY_REWARD.money} €</button>` : (def.need > 1 ? `${prog}/${def.need}` : '');
        return `<div class="qline ${got ? 'got' : ''}"><span>${def.icon}</span><i>${esc(t(def.label))}</i><em>${right}</em></div>`;
      }).join('');
      const allGot = d.picks.every(id => d.claimed[id]);
      const bonus = allGot && !d.bonus ? `<div class="qbtns keep"><button class="go" data-dclaim="bonus">🏆 ${t('Journée parfaite')} +${DAILY_BONUS.money} €</button></div>` : '';
      const dreamBtn = dream ? `<div class="qbtns keep"><button class="go" data-claim="${dream.id}">🌟 ${esc(t(dream.label))} · ${t('🎁 Récupérer')}</button></div>` : '';
      const done = d.picks.filter(id => d.claimed[id]).length;
      key = `day${d.day}:${JSON.stringify(d.progress)}:${JSON.stringify(d.claimed)}:${d.bonus}:${dream && dream.id}:${xp}:${settings().lang}`;
      html = `<div class="qh"><span>📅</span>${t('Objectifs du jour')} · ${done}/${d.picks.length}<em>${lvTxt}</em></div>
        <div class="qbar xp" title="${xp} XP"><i style="width:${next ? Math.min(100, ((xp - prev) / (next - prev)) * 100).toFixed(0) : 100}%"></i></div>
        <div class="qlist">${lines}</div>${bonus}${dreamBtn}`;
    }
    if (key !== this.questKey) { el.innerHTML = html; this.questKey = key; }
    el.classList.toggle('hidden', !html);
    // L'élément de l'interface lié à l'étape du tutoriel s'illumine (ex. 💼 pour « Va travailler »)
    const hintId = step && !tutReady(p) ? step.ui : null;
    if (hintId !== this.hintId) {
      if (this.hintId && $(this.hintId)) ($(this.hintId).closest('.pill') || $(this.hintId)).classList.remove('hint');
      if (hintId && $(hintId)) ($(hintId).closest('.pill') || $(hintId)).classList.add('hint');
      this.hintId = hintId;
    }
    // dans un bâtiment, sur petit écran, la carte se réduit d'elle-même pour laisser voir la pièce
    el.classList.toggle('min', !!this.questMin || (p.inside != null && window.innerHeight < 500));
  }

  onQuestClick(e) {
    const btn = e.target.closest('button');
    if (btn && btn.dataset.dclaim) {
      const r = this.world.perform(this.player, 'claim_goal', { goal: 'daily', id: btn.dataset.dclaim });
      if (r.ok) { this.questKey = ''; this.syncQuest(); this.buzz(); }
      return;
    }
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
    else if (kind === 'vacant') b = w.map.buildings.filter(x => freeUnits(w, x) > 0).sort((x, y) => weeklyRent(x) - weeklyRent(y) || dist(x) - dist(y))[0];
    else if (kind === 'hiring') b = w.map.buildings.filter(x => openings(w, x) > 0 && (x.jobs.edu || 0) <= (p.education ?? 1)).sort((x, y) => dist(x) - dist(y))[0];
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
    const walk = b => Math.max(1, Math.round(Math.min(...b.entrances.map(e => Math.abs(e.x - p.px) + Math.abs(e.y - p.py))) / 1.1)); // (minutes à pied)
    const GROUPS = [['☕ Manger et boire', ['cafe', 'bakery']], ['🛍️ Boutiques et sport', ['shop', 'fashion', 'garage', 'gym']],
      ['💼 Travail', ['office']], ['🏛️ Services', ['cityhall', 'court', 'bank', 'police', 'hospital', 'firestation', 'school', 'prison', 'metro']], ['🏠 Logements', ['home']]];
    const status = b => {
      if (b.type === 'home') {
        if (b.id === p.home) return t('🏠 chez toi');
        const f = freeUnits(w, b);
        return f ? L(`🔑 ${f} libre${f > 1 ? 's' : ''} · ${weeklyRent(b)} €/sem.`, `🔑 ${f} free · €${weeklyRent(b)}/wk`) : t('complet');
      }
      if (b.type === 'metro') return t('bientôt : voyager');
      if (isClosed(w, b.id)) return t('🔒 fermé (repreneur à venir)');
      const mine = p.job && p.job.building === b.id ? t(' · ton travail') : '';
      const jobs = b.jobs && openings(w, b) ? ` · ${openings(w, b)} poste${openings(w, b) > 1 ? 's' : ''}` : '';
      if (b.type === 'office') return `${t(mine ? 'ton travail' : 'bureaux')}${jobs}`;
      return `${t(sellerAt(w, b) ? '🟢 ouvert' : '🔴 fermé')}${mine}${jobs}`;
    };
    const sections = GROUPS.map(([title, types]) => {
      const list = w.map.buildings.filter(b => types.includes(b.type)).sort((a, b) => walk(a) - walk(b));
      if (!list.length) return '';
      return `<div class="sec"><b>${t(title)}</b><div class="list">${list.map(b => `<button data-goto-b="${b.id}">
        <span class="ic">${b.type === 'home' && b.id === p.home ? '🏠' : isClosed(w, b.id) ? '🔒' : TYPES[b.type].icon}</span>
        <span class="nm">${esc(b.name)}<small>${status(b)}</small></span><span class="rt">🚶 ${walk(b)} min</span></button>`).join('')}</div></div>`;
    });
    return `${this.head('🗺️', t('Plan · {x}', { x: w.map.name }))}${sections.join('')}`;
  }

  peopleHTML() {
    const p = this.player, w = this.world;
    const where = a => (a.inside != null ? (a.inside === a.home ? t('à la maison') : w.building(a.inside).name) : t('dans la rue'));
    const list = w.actors.filter(a => a !== p).sort((a, b) => rel(p, b) - rel(p, a) || a.name.localeCompare(b.name, 'fr'));
    const known = list.filter(a => rel(p, a) >= 10).length;
    const rows = list.map(a => {
      const r = rel(p, a);
      const [, lname, licon] = level(r);
      const job = a.role && ROLE_TITLES[a.role] ? ROLE_TITLES[a.role] : a.job ? jobTitle(w, a.job) : 'Sans emploi';
      const now = a.doing && ACTIONS[a.doing] ? ACTIONS[a.doing].icon : '';
      return `<button data-person="${a.id}"><span class="ic">${licon}</span><span class="nm">${esc(a.name)}<small>${esc(t(job))} · ${t(lname)}</small></span>
        <span class="rt">${now} ${esc(where(a))}</span></button>`;
    });
    return `${this.head('👥', t('Habitants · {n}', { n: list.length }))}<p>${L(`Tu connais ${known} personne${known > 1 ? 's' : ''}. Touche quelqu’un pour le retrouver.`, `You know ${known} ${known > 1 ? 'people' : 'person'}. Tap someone to find them.`)}</p><div class="list">${rows.join('')}</div>`;
  }

  // ---------- Prochain rendez-vous (HUD) ----------
  nextAppointment() {
    const p = this.player, w = this.world;
    if (jailed(w, p)) return ['⛓️', L(`sortie ${Math.ceil((p.jailUntil - w.minutes) / 1440)} j`, `out in ${Math.ceil((p.jailUntil - w.minutes) / 1440)} d`)];
    if (p.wanted > 0) return ['🚨', L('recherché·e', 'wanted')];
    if (p.sick) return ['🤧', L('malade', 'sick')];
    if (p.housing === 'rent' && p.rentDue > 0) return ['🧾', `${p.rentDue} €`];
    const g = w.gov;
    if (g && g.votingOpen && !g.votes[p.id]) return ['🗳️', L('vote', 'vote')];
    // (l'heure du service est déjà en bas à gauche : ici, seulement quand il faut y aller maintenant)
    if (p.job && !p.job.street && p.doing !== 'work' && !(p.plan && p.plan.id === 'work')) {
      const n = nextShift(p.job, w);
      if (n && n.start - w.minutes <= 30 && w.minutes < n.end - 60) return ['💼', t(w.minutes > n.start ? 'en retard !' : 'c’est l’heure')];
    }
    if (w.hour >= 22 || w.hour < 5) return ['😴', t('au lit')];
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

  // durée réglable dans les paramètres (0 = l'événement reste jusqu'à ce qu'on le ferme) ; deux fois plus s'il y a un choix à faire
  evLife(ev) { const s = settings().eventTimer; return !s ? Infinity : (ev.choices.some(c => c.action) ? s * 2000 : s * 1000); }

  // ---------- Astuces : une à la fois, chacune une seule fois ----------
  checkTips(now) {
    const p = this.player, w = this.world;
    if (now - (this.tipAt || -1e9) < 45000 || this.tipOn) return;
    p.tips = p.tips || [];
    const TIPS = [
      ['camera', () => p.outdoors && w.minutes > 40, '🎥 Un doigt : tourner la vue · deux doigts : zoomer et déplacer · 🎯 pour te suivre à nouveau.'],
      ['career', () => p.job && w.day >= 3, '📈 Chaque lieu a plusieurs postes : diplôme 🎓, formation 📜 (à l’école) ou expérience ⏳. Ouvre la fiche de ton travail pour demander une promotion.'],
      ['guide', () => p.goals && p.goals.tut >= 1, '📖 Perdu·e ? Le guide complet du jeu est dans ⚙️ Paramètres (en haut à droite).'],
      ['hungry', () => p.hunger > 65, '🍔 Ton ventre gargouille : cuisine chez toi (🥫 = repas au frigo) ou va à la boulangerie.'],
      ['tired', () => p.energy < 25, '⚡ Tu fatigues : rentre dormir, ou bois un café pour tenir jusqu’au soir.'],
      ['mood', () => p.mood < 40, '😊 Ton moral baisse : discute avec quelqu’un, regarde la télé, lis ou assieds-toi sur un banc.'],
      ['broke', () => p.money < 60, '💶 Ton argent fond : travaille, ou demande l’aide sociale à la mairie si tu es sans emploi.'],
      ['rent', () => p.rentDue > 0, '🧾 Ton loyer est à payer (le lundi) : touche 🏠 dans la colonne de gauche. Après 8 jours de retard, c’est l’expulsion.'],
      ['inside', () => p.inside != null, '🪑 À l’intérieur, touche un meuble pour l’utiliser : lit, canapé, télé, comptoir…'],
      ['night', () => (w.hour >= 22 || w.hour < 4) && p.outdoors, '🌙 Il se fait tard : rentre dormir pour être en forme demain.'],
      ['vote', () => w.gov && w.gov.votingOpen && !w.gov.votes[p.id], '🗳️ Élections municipales : va voter à la mairie 🏛️ (et tu peux même te présenter !).'],
      ['map', () => !tutStep(p), '🗺️ Le bouton 🗺️ (à droite) liste tous les lieux du quartier, 👥 tous les habitants.'],
      ['routine', () => !tutStep(p) && w.day >= 2, '🔁 Le bouton 🔁 (à droite) lance la routine : ton personnage mange, dort et travaille tout seul.'],
      ['dreams', () => !tutStep(p), '🌟 Tes rêves sont dans « Ma vie » (💼 à gauche) : chacun rapporte une récompense.'],
    ];
    if (!settings().tips) return;
    const tip = TIPS.find(([id, cond]) => !p.tips.includes(id) && cond());
    if (!tip) return;
    p.tips.push(tip[0]);
    this.tipAt = now; this.tipOn = true;
    const el = $('tip');
    el.textContent = t(tip[2]);
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
    const role = t.role ? `${tr(ROLE_TITLES[t.role])} · ` : '';
    const job = t.job ? `${role}${esc(tr(jobTitle(w, t.job)))}${t.job.street ? '' : ` · ${esc(w.building(t.job.building).name)}`}` : (t.role ? tr(ROLE_TITLES[t.role]) : tr('Sans emploi'));
    const now = t.doing ? `<br>${ACTIONS[t.doing].icon} ${esc(tr(ACTIONS[t.doing].label))}` : '';
    const reach = canReach(p, t);
    // Interactions : elles se débloquent avec la relation (le bouton grisé dit pourquoi)
    const extra = [];
    if (!near(p, t)) extra.push(this.choiceHTML('data-join', '🚶', 'Rejoindre', '', true));
    if (isBirthday(w, t)) extra.push(this.actBtn('wish_birthday', { who: t.id }));
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
      ? `<div class="msg me">${esc(tr(m.text))}</div>`
      : m.from === 'npc' ? `<div class="msg them"><b>${esc(t.name)}</b> ${esc(tr(m.text))}</div>` : `<div class="msg note">${esc(tr(m.text))}</div>`).join('');
    const offers = (this.chatOffers || []).map((o, i) => this.choiceHTML(`data-offer="${i}"`, o.icon, o.label, '', this.world.check(p, o.action, o.params))).join('');
    // Réponses proposées après la dernière réplique, puis les thèmes
    const picks = (this.chatChoices || []).map((c, i) => `<button class="pick" data-pick="${i}" ${reach && !this.chatWaiting ? '' : 'disabled'}><span>${c.icon}</span>${esc(tr(c.label))}</button>`).join('');
    const topics = topicsFor(t).map(tp => `<button class="topic" data-topic="${tp.id}" ${reach && !this.chatWaiting ? '' : 'disabled'}><span>${tp.icon}</span>${esc(tr(tp.label))}</button>`).join('');
    const mode = chatMode() === 'local' ? `<small class="mode">${tr('réponses intégrées · ajoute une clé API pour des PNJ encore plus vivants')}</small>` : '';
    const intro = reach ? tr(`Choisis un sujet ou écris ce que tu veux dire à ${t.name}.`) : tr('Trop loin pour parler.');
    const chat = `<div class="sec chat"><div class="log">${log || `<div class="msg note">${intro}</div>`}${this.chatWaiting ? `<div class="msg them typing">${esc(t.name)} réfléchit…</div>` : ''}</div>
      ${offers ? `<div class="choices">${offers}</div>` : ''}
      ${picks ? `<div class="picks">${picks}</div>` : ''}
      <div class="topics">${topics}</div>
      <form class="say-form" data-chat><input id="chat-in" maxlength="300" autocomplete="off" placeholder="${tr(reach ? 'Ou écris librement…' : 'Trop loin pour parler')}" ${reach && !this.chatWaiting ? '' : 'disabled'}><button type="submit" ${reach ? '' : 'disabled'}>➤</button></form>${mode}</div>`;

    return `${this.head('🧑', t.name)}<p>${licon} ${tr(lname)} · <span class="hearts">${hearts(r)}</span><br>${L(`${ensureAge(t)} ans`, `${ensureAge(t)} years old`)}${isBirthday(w, t) ? ' · 🎂' : ''}${t.retired ? L(' · retraité·e', ' · retired') : ''}<br>${job}${now}</p>
      <div class="sec"><b>${tr('✨ Interagir')}</b><div class="choices">${extra.join('')}</div></div>${chat}`;
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
    if (p.plan && p.plan.id === 'goto') return { key: 'walk', hidden: true }; // marcher : pas de fenêtre (les pointillés dorés suffisent)
    if (p.plan) {
      const def = ACTIONS[p.plan.id];
      const b = p.plan.buildingId != null ? w.building(p.plan.buildingId) : null;
      return {
        key: `plan:${p.plan.id}:${p.plan.buildingId}`, icon: '🚶',
        title: p.plan.id === 'goto' ? (p.vehicle ? ({ velo: '🚲 À vélo', trottinette: '🛴 En trottinette', scooter: '🛵 En scooter', voiture: '🚗 En voiture' }[p.vehicle] || 'En marche') : 'En marche') : t('En route : {x}', { x: t(def.label) }),
        sub: b ? b.name : '', cancel: true,
      };
    }
    if (p.routine) return { key: 'routine', icon: '🔁', title: 'Routine', sub: 'Ta routine choisit la prochaine activité.' };
    return { key: 'idle', hidden: true }; // rien en cours : la fenêtre se cache
  }

  statusHTML(info) {
    return `<div class="box-head"><span class="ico">${info.icon}</span><b>${esc(t(info.title))}</b>
      ${info.cancel ? `<button class="box-close" data-cancel title="${t('Arrêter')}">✕</button>` : ''}</div>
      <p class="sub">${esc(t(info.sub))}</p>
      ${info.progress != null ? `<div class="progress"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></div>` : ''}`;
  }

  onBoxClick(e) {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const w = this.world, p = this.player;
    if (btn.hasAttribute('data-close')) { if (p.inside != null && !this.place && !this.panel && !this.person && !this.life) this.stayHidden = p.inside; this.placeMore = false; this.closePanels(); return this.render(); }
    if (btn.hasAttribute('data-evclose')) { this.director.close(); this.evShown = null; return this.render(); }
    if (btn.dataset.set) { setSetting(btn.dataset.set, !settings()[btn.dataset.set]); if (btn.dataset.set === 'sound' && settings().sound) this.sound.start(); return this.render(); }
    if (btn.dataset.setk) { const v = btn.dataset.setv; const changed = settings()[btn.dataset.setk] !== v; setSetting(btn.dataset.setk, /^\d+$/.test(v) ? Number(v) : v); if (btn.dataset.setk === 'gfx' && changed) { setTimeout(() => location.reload(), 150); return; } return this.render(); }
    if (btn.hasAttribute('data-resettips')) { p.tips = []; this.tipAt = -1e9; this.floatNote(t('Les astuces réapparaîtront.')); return; }
    if (btn.hasAttribute('data-cancel')) { w.cancel(p); return this.render(); }
    if (btn.hasAttribute('data-leave')) { w.perform(p, 'leave'); this.placeMore = false; return this.render(); }
    if (btn.hasAttribute('data-more')) { this.placeMore = !this.placeMore; return this.render(); }
    if (btn.hasAttribute('data-furn')) { this.furnOpen = !this.furnOpen; return this.render(true); }
    if (btn.dataset.cert) { this.selCert = btn.dataset.cert; return this.render(true); }
    if (btn.dataset.pos) { this.selPos = this.selPos || {}; this.selPos[btn.dataset.pb] = btn.dataset.pos; return this.render(true); }
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
