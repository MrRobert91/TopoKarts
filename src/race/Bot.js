import * as THREE from 'three';

const DIFFICULTY = {
  easy:   { speed: 0.78, skill: 0.55, itemRate: 0.012, rubber: 0.10 },
  normal: { speed: 0.90, skill: 0.78, itemRate: 0.02,  rubber: 0.16 },
  hard:   { speed: 0.99, skill: 0.95, itemRate: 0.03,  rubber: 0.22 },
};

/**
 * Controlador de bot: produce "controls" como un jugador.
 * No entiende la topología de verdad: sigue la spline con una línea de
 * carrera sencilla (abrirse en las curvas) y algo de ruido de personalidad.
 */
export class BotController {
  constructor(kart, difficulty = 'normal') {
    this.kart = kart;
    this.cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    this.targetQ = 0;
    this.wander = Math.random() * 1000;
    this.repathT = 0;
    this.itemT = 2 + Math.random() * 4;
    this.stuckT = 0;
  }

  update(dt, race) {
    const kart = this.kart;
    const tr = kart.track;
    const w = tr.isSurface ? tr.bandHalf : tr.widthAt(kart.s);

    this.repathT -= dt;
    if (this.repathT <= 0) {
      this.repathT = 0.5 + Math.random() * 0.5;
      // línea de carrera: cortar hacia el interior de la próxima curva
      const kAhead = kart.signedCurvature(kart.s + 22 + kart.v * 0.6);
      const cut = THREE.MathUtils.clamp(kAhead * 220, -1, 1);
      this.targetQ = cut * w * 0.55 * this.cfg.skill
        + Math.sin(this.wander + kart.s * 0.013) * w * 0.25 * (1 - this.cfg.skill);
      // en el toro, los bots buenos a veces se meten por dentro del tubo (ciclo B)
      if (tr.kind === 'torus' && this.cfg.skill > 0.7 && Math.sin(this.wander * 3 + kart.s * 0.004) > 0.86) {
        this.targetQ = tr.lateralPeriod / 2 * Math.sign(Math.sin(this.wander));
      }
    }

    // dirección hacia targetQ
    const dq = this.targetQ - kart.q;
    const desiredHeading = THREE.MathUtils.clamp(dq * 0.06, -0.45, 0.45);
    const err = desiredHeading - kart.heading;
    const steerDead = 0.02 + (1 - this.cfg.skill) * 0.04;
    const controls = {
      left: err < -steerDead,
      right: err > steerDead,
      accel: true,
      brake: false,
      drift: false,
      item: false,
      lookBack: false,
      respawn: false,
    };

    // frenar en curvas cerradas si va lanzado
    const kNow = Math.abs(kart.signedCurvature(kart.s + 10));
    if (kNow * kart.v > 0.95 * this.cfg.skill + 0.35) controls.brake = true;

    // goma elástica con el mejor humano
    const human = race.bestHumanProgress();
    if (human !== null) {
      const gap = (human - kart.s) / tr.length; // >0: el humano va delante
      const stats = { ...kart.character.stats };
      stats.topSpeed *= this.cfg.speed * (1 + THREE.MathUtils.clamp(gap, -0.5, 0.5) * this.cfg.rubber * 4);
      this._stats = stats;
    } else {
      this._stats = { ...kart.character.stats, topSpeed: kart.character.stats.topSpeed * this.cfg.speed };
    }

    // usar objeto de vez en cuando
    this.itemT -= dt;
    if (kart.item && this.itemT <= 0) {
      controls.item = true;
      this.itemT = 3 + Math.random() * 5;
    }

    // detección de atasco
    if (kart.v < 2 && kart.fallT <= 0 && kart.spinT <= 0) {
      this.stuckT += dt;
      if (this.stuckT > 3) { kart.forceRespawn(); this.stuckT = 0; }
    } else this.stuckT = 0;

    return controls;
  }

  get stats() { return this._stats ?? this.kart.character.stats; }
}
