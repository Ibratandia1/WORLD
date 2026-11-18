// Sons du jeu, entièrement synthétisés (Web Audio) : aucun fichier à télécharger ni licence à gérer.
// Ambiances : rumeur de la ville, voitures qui passent, oiseaux le jour, grillons les nuits d'été,
// pluie, vent de neige, brouhaha et tasses au café. Petits sons d'interface : clic, événement, pièces, erreur, porte.
// Le son démarre au premier toucher (règle des navigateurs) ; bouton 🔊 / 🔇 pour couper, choix mémorisé.

import { settings, setSetting, onSettings } from './settings.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.state = {};
    const unlock = () => { this.start(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    onSettings(() => this.apply());
  }

  get on() { return settings().sound; }

  toggle() {
    setSetting('sound', !settings().sound);
    if (this.on) this.start();
    return this.on;
  }

  // Volumes selon les paramètres : général, musique, ambiances, interface
  apply() {
    if (!this.ctx) return;
    const s = settings(), t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.sound ? s.volume : 0, t, 0.1);
    this.ambGate.gain.setTargetAtTime(s.ambience ? (s.ambVol ?? 1) : 0, t, 0.1);
    this.mus.gain.setTargetAtTime(s.music ? (s.musVol ?? 1) : 0, t, 0.1);
    this.ui.gain.setTargetAtTime(s.uiSounds ? 0.5 * (s.uiVol ?? 1) : 0, t, 0.1);
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(c.destination);
    // Bus d'ambiance : étouffé (passe-bas) quand on est à l'intérieur
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 18000;
    this.amb = c.createGain(); this.amb.gain.value = 1;
    this.ambGate = c.createGain(); this.ambGate.gain.value = 1;            // coupe les ambiances
    this.mus = c.createGain(); this.mus.gain.value = 1;                    // coupe la musique
    this.amb.connect(this.ambGate).connect(this.muffle);
    this.mus.connect(this.muffle);
    this.muffle.connect(this.master);
    this.ui = c.createGain(); this.ui.gain.value = 0.5; this.ui.connect(this.master);

    // Bruit blanc réutilisé par les ambiances
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const loop = (type, freq, q = 0.7) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.amb); src.start();
      return g;
    };
    this.city = loop('lowpass', 380);          // rumeur lointaine de la ville
    this.rain = loop('bandpass', 2600, 0.4);    // pluie
    this.wind = loop('lowpass', 260);           // vent d'hiver
    this.crowd = loop('bandpass', 700, 1.2);    // brouhaha (café, boulangerie)
    this.timer = setInterval(() => this.tick(), 250);
    this.apply();
  }

  // État du monde envoyé par l'interface ~4 fois par seconde
  setScene(s) { this.state = s; }

  ramp(g, v, t = 1.2) { g.gain.setTargetAtTime(v, this.ctx.currentTime, t); }

  tick() {
    if (!this.ctx || !this.on) return;
    const s = this.state;
    const out = s.outdoors;
    const busy = s.pulse ?? 0.6; // animation de la ville selon l'heure
    this.muffle.frequency.setTargetAtTime(out ? 18000 : 700, this.ctx.currentTime, 0.3);
    this.ramp(this.city, (out ? 0.014 : 0.006) * (0.4 + busy)); // rumeur de la ville : très discrète (demandé)
    this.ramp(this.rain, s.weather === 'rain' ? (out ? 0.06 : 0.025) : 0, 2);
    this.ramp(this.wind, s.weather === 'snow' ? 0.03 : s.weather === 'cloud' && out ? 0.006 : 0, 2);
    const lively = !out && ['cafe', 'bakery', 'shop', 'cityhall', 'fashion'].includes(s.place);
    const fair = out && (s.fest === 'marche' || s.fest === 'brocante' || s.fest === 'concert');
    this.ramp(this.crowd, lively ? 0.018 : fair ? 0.015 : 0, 0.6);
    // Musique des fêtes (concert, fête de la musique) : une petite valse musette jouée en direct
    if (out && (s.fest === 'concert' || s.fest === 'musique')) this.music();

    const r = Math.random();
    const day = s.hour >= 6 && s.hour < 20;
    // oiseaux : rares et doux, un petit chœur le matin, un peu plus dans les parcs
    const dawn = s.hour >= 6 && s.hour < 9;
    if (out && day && s.weather !== 'rain' && s.weather !== 'snow' && r < (dawn ? 0.02 : 0.01) * (s.season === 'hiver' ? 0.4 : 1)) this.bird();
    if (out && !day && (s.season === 'ete' || s.season === 'printemps') && s.weather !== 'rain' && r < 0.12) this.cricket();
    if (out && r > 1 - 0.01 * busy) this.car();
    if (lively && s.place !== 'shop' && Math.random() < 0.06) this.clink();
  }

  // ---------- Petits sons synthétisés ----------
  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0, bus = this.ui } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { freq = 1000, q = 1, vol = 0.1, to = null, delay = 0, bus = this.ui } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // Chant d'oiseau : sifflement modulé (vibrato), adouci par un filtre selon la distance, placé à gauche ou à droite.
  // Trois sortes : merle (phrase qui descend), mésange (« ti-tu ti-tu »), moineau (petit trille)
  chirp(f0, f1, dur, { delay = 0, vol = 0.02, vib = 0, vibRate = 28, pan = 0, cutoff = 6000 } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g);
    if (p) { p.pan.value = pan; g.connect(p).connect(this.amb); } else g.connect(this.amb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  bird() {
    const pan = Math.random() * 1.6 - 0.8, far = Math.random() * 0.6, vol = 0.018 + (1 - far) * 0.012, cutoff = 3500 + (1 - far) * 4000;
    const kind = Math.random();
    if (kind < 0.35) { // merle : 3–4 notes flûtées qui descendent
      let f = 2100 + Math.random() * 500;
      const n = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) { this.chirp(f * 1.08, f * 0.9, 0.16, { delay: i * 0.2, vol, vib: 40, vibRate: 22, pan, cutoff }); f *= 0.93 + Math.random() * 0.12; }
    } else if (kind < 0.7) { // mésange : « ti-tu » répété
      const hi = 3300 + Math.random() * 400, lo = hi * 0.78;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { this.chirp(hi, hi * 0.97, 0.08, { delay: i * 0.3, vol, pan, cutoff }); this.chirp(lo, lo * 0.95, 0.12, { delay: i * 0.3 + 0.1, vol: vol * 0.9, pan, cutoff }); }
    } else { // moineau : petit trille rapide
      const f = 3600 + Math.random() * 600;
      for (let i = 0; i < 5 + Math.floor(Math.random() * 4); i++) this.chirp(f, f * 1.12, 0.035, { delay: i * 0.055, vol: vol * 0.7, pan, cutoff });
    }
  }
  cricket() { for (let i = 0; i < 3; i++) this.tone(4300, 0.04, { type: 'triangle', vol: 0.012, delay: i * 0.07, bus: this.amb }); }
  car() { this.noise(2.4, { freq: 160, to: 120, q: 0.6, vol: 0.007, bus: this.amb }); } // léger roulement lointain (plus de « vroum » qui dérange)
  clink() { const f = 2600 + Math.random() * 1200; this.tone(f, 0.12, { vol: 0.03, bus: this.amb }); this.tone(f * 1.5, 0.08, { vol: 0.015, delay: 0.01, bus: this.amb }); }

  // Valse (3 temps) sur une grille d'accords la mineur – fa – do – mi : basse au 1er temps, accord ensuite,
  // et une mélodie qui monte et descend sur les notes de l'accord. Appelée toutes les 250 ms.
  music() {
    const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]];
    const midi = m => 440 * Math.pow(2, (m - 69) / 12);
    const b = this.beat = (this.beat || 0) + 1;
    const bar = Math.floor(b / 3) % 8, ch = CHORDS[Math.floor(bar / 2) % 4], t = b % 3;
    if (t === 0) this.tone(midi(ch[0] - 12), 0.45, { vol: 0.06, bus: this.mus });
    else { this.tone(midi(ch[1]), 0.18, { type: 'triangle', vol: 0.025, bus: this.mus }); this.tone(midi(ch[2]), 0.18, { type: 'triangle', vol: 0.02, bus: this.mus }); }
    const melody = [2, 1, 0, 1, 2, 2, 1, 0][(b + bar) % 8];
    this.tone(midi(ch[melody] + 12), 0.22, { type: 'square', vol: 0.018, bus: this.mus });
  }

  click() { this.tone(660, 0.035, { type: 'sine', vol: 0.04 }); }
  pop() { this.tone(520, 0.09, { vol: 0.05, to: 700 }); } // info sans importance : un petit « pop » discret
  chime() { this.tone(659, 0.3, { vol: 0.08 }); this.tone(988, 0.45, { vol: 0.065, delay: 0.14 }); } // annonce importante
  coin() { this.tone(1320, 0.07, { type: 'triangle', vol: 0.05 }); this.tone(1760, 0.16, { type: 'triangle', vol: 0.045, delay: 0.06 }); }
  error() { this.tone(300, 0.12, { type: 'sine', vol: 0.06, to: 220 }); } // « bop » grave et doux (plus de bourdon)
  door() { this.noise(0.25, { freq: 400, to: 180, q: 2, vol: 0.12 }); this.tone(140, 0.15, { vol: 0.08, delay: 0.18 }); }
  // Sons des moments importants (synthétisés, comme le reste)
  sparkle() { [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.18, { vol: 0.07, delay: i * 0.07 })); }          // fidélité, cadeau
  hired() { [523, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.09, delay: i * 0.09 })); } // embauche
  whistle() { this.tone(1900, 0.12, { vol: 0.08 }); this.tone(1900, 0.3, { vol: 0.08, delay: 0.16 }); }               // amende, police
  gavel() { this.noise(0.06, { freq: 900, q: 3, vol: 0.2 }); this.noise(0.06, { freq: 900, q: 3, vol: 0.2, delay: 0.22 }); } // verdict
  unlock() { this.tone(660, 0.1, { type: 'triangle', vol: 0.08 }); this.tone(990, 0.25, { type: 'triangle', vol: 0.08, delay: 0.1 }); } // libération
  // Feu d'artifice : détonation sourde puis crépitement (ambiance, étouffé à l'intérieur)
  boom() {
    this.noise(0.5, { freq: 120, to: 60, q: 0.8, vol: 0.09, bus: this.amb });
    for (let i = 0; i < 6; i++) this.noise(0.05, { freq: 3000 + Math.random() * 2000, q: 2, vol: 0.02, delay: 0.25 + i * 0.07 + Math.random() * 0.05, bus: this.amb });
  }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.1 })); }
}
