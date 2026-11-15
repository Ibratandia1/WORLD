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
  }

  update() {
    const raining = state.world.weather === 'rain' && state.player.inside == null;
    if (raining && !this.rain.emitting) this.rain.start();
    else if (!raining && this.rain.emitting) this.rain.stop();
  }
}
