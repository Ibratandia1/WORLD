import { state } from '../state.js';

// Effets plein écran au-dessus de la carte (pluie), non affectés par le zoom.
export class FxScene extends Phaser.Scene {
  constructor() { super('fx'); }

  create() {
    this.rain = this.add.particles(0, 0, 'drop', {
      x: { min: -200, max: 6000 }, y: -20,
      lifespan: 1100, speedY: { min: 650, max: 850 }, speedX: { min: -160, max: -120 },
      rotate: 10, alpha: { start: 0.65, end: 0.25 }, quantity: 3, frequency: 18,
      emitting: false,
    });

    // Flocons, feuilles mortes, pétales de cerisier
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff); g.fillCircle(3, 3, 2.6); g.generateTexture('flake', 6, 6);
    g.clear(); g.fillStyle(0xd9792f); g.fillEllipse(5, 3, 9, 5); g.fillStyle(0xa8442a); g.fillRect(4, 2, 2, 1); g.generateTexture('leaf', 10, 6);
    g.clear(); g.fillStyle(0xf6b3cd); g.fillEllipse(3, 2, 6, 4); g.generateTexture('petal', 6, 4);
    g.destroy();
    this.snow = this.add.particles(0, 0, 'flake', {
      x: { min: -200, max: 6000 }, y: -20, lifespan: 6000, speedY: { min: 60, max: 120 }, speedX: { min: -40, max: 30 },
      scale: { min: 0.5, max: 1.4 }, alpha: { start: 0.95, end: 0.5 }, quantity: 2, frequency: 30, emitting: false,
    });
    this.leaves = this.add.particles(0, 0, 'leaf', {
      x: { min: -200, max: 6000 }, y: -20, lifespan: 9000, speedY: { min: 40, max: 80 }, speedX: { min: -70, max: -20 },
      rotate: { min: 0, max: 360 }, angle: { min: 80, max: 120 }, scale: { min: 0.8, max: 1.5 }, quantity: 1, frequency: 450, emitting: false,
    });
    this.petals = this.add.particles(0, 0, 'petal', {
      x: { min: -200, max: 6000 }, y: -20, lifespan: 9000, speedY: { min: 35, max: 70 }, speedX: { min: -60, max: -10 },
      rotate: { min: 0, max: 360 }, scale: { min: 0.8, max: 1.4 }, quantity: 1, frequency: 700, emitting: false,
    });
  }

  update() {
    const w = state.world, out = state.player.inside == null;
    const set = (em, on) => { if (on && !em.emitting) em.start(); else if (!on && em.emitting) em.stop(); };
    set(this.rain, out && w.weather === 'rain');
    set(this.snow, out && w.weather === 'snow');
    set(this.leaves, out && w.season === 'automne' && w.weather !== 'rain');
    set(this.petals, out && w.season === 'printemps' && w.weather === 'sun' && w.hour > 7 && w.hour < 20);
    // la nuit, les flocons sont dans l'ombre comme le reste
    if (this.snow.emitting && this.snow.setParticleTint) this.snow.setParticleTint(state.scene && state.scene.nightTint ? state.scene.nightTint : 0xffffff);
  }
}
