// Sons du jeu, entièrement synthétisés (Web Audio) : aucun fichier à télécharger ni licence à gérer.
// Ambiances : rumeur de la ville, voitures qui passent, oiseaux le jour, grillons les nuits d'été,
// pluie, vent de neige, brouhaha et tasses au café. Petits sons d'interface : clic, événement, pièces, erreur, porte.
// Le son démarre au premier toucher (règle des navigateurs) ; bouton 🔊 / 🔇 pour couper, choix mémorisé.

const KEY = 'world.sound';

export class Sound {
  constructor() {
    this.on = true;
    try { this.on = localStorage.getItem(KEY) !== 'off'; } catch { /* stockage indisponible */ }
    this.ctx = null;
    this.state = {};
    const unlock = () => { this.start(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? 'on' : 'off'); } catch { /* rien */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.1);
    if (this.on) this.start();
    return this.on;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    this.master.connect(c.destination);
    // Bus d'ambiance : étouffé (passe-bas) quand on est à l'intérieur
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 18000;
    this.amb = c.createGain(); this.amb.gain.value = 1;
    this.amb.connect(this.muffle).connect(this.master);
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
    this.ramp(this.city, (out ? 0.05 : 0.025) * (0.4 + busy));
    this.ramp(this.rain, s.weather === 'rain' ? (out ? 0.16 : 0.07) : 0, 2);
    this.ramp(this.wind, s.weather === 'snow' ? 0.09 : s.weather === 'cloud' && out ? 0.02 : 0, 2);
    const lively = !out && ['cafe', 'bakery', 'shop', 'cityhall', 'fashion'].includes(s.place);
    this.ramp(this.crowd, lively ? 0.05 : 0, 0.6);

    const r = Math.random();
    const day = s.hour >= 6 && s.hour < 20;
    if (out && day && s.weather !== 'rain' && s.weather !== 'snow' && r < 0.07) this.bird();
    if (out && !day && (s.season === 'ete' || s.season === 'printemps') && s.weather !== 'rain' && r < 0.12) this.cricket();
    if (out && r > 1 - 0.05 * busy) this.car();
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

  bird() {
    const base = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(base, 0.09, { to: base * 1.35, vol: 0.035, delay: i * 0.13, bus: this.amb });
  }
  cricket() { for (let i = 0; i < 3; i++) this.tone(4300, 0.04, { type: 'triangle', vol: 0.012, delay: i * 0.07, bus: this.amb }); }
  car() { const up = Math.random() < 0.5; this.noise(1.6, { freq: up ? 300 : 900, to: up ? 900 : 300, q: 0.8, vol: 0.05, bus: this.amb }); }
  clink() { const f = 2600 + Math.random() * 1200; this.tone(f, 0.12, { vol: 0.03, bus: this.amb }); this.tone(f * 1.5, 0.08, { vol: 0.015, delay: 0.01, bus: this.amb }); }

  click() { this.tone(880, 0.05, { type: 'triangle', vol: 0.08 }); }
  chime() { this.tone(784, 0.25, { vol: 0.12 }); this.tone(1175, 0.35, { vol: 0.1, delay: 0.12 }); }
  coin() { this.tone(1320, 0.08, { type: 'square', vol: 0.05 }); this.tone(1760, 0.18, { type: 'square', vol: 0.05, delay: 0.07 }); }
  error() { this.tone(220, 0.18, { type: 'sawtooth', vol: 0.06, to: 160 }); }
  door() { this.noise(0.25, { freq: 400, to: 180, q: 2, vol: 0.12 }); this.tone(140, 0.15, { vol: 0.08, delay: 0.18 }); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.1 })); }
}
