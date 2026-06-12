import * as THREE from 'three';
import { buildKart } from './KartVisual.js';

const BASE_TOP_SPEED = 46;     // m/s
const BASE_ACCEL = 30;
const BRAKE = 55;
const FRICTION = 14;
const OFFROAD_FACTOR = 0.45;
const TURN_RATE = 1.9;         // rad/s a baja velocidad

/**
 * Kart en coordenadas de carretera (s, q, heading).
 *  - s: longitud de arco a lo largo de la spline (continua, sin acotar)
 *  - q: desplazamiento lateral
 *  - heading: ángulo respecto a la tangente de la pista
 *  - flip: nº de vueltas acumuladas (en Möbius cambia la cara de la cinta)
 *
 * La curvatura con signo de la pista acopla s y heading: si no giras en una
 * curva, te vas hacia fuera, exactamente como en una carretera de verdad.
 */
export class Kart {
  constructor(track, character, { isBot = false, name = character.name } = {}) {
    this.track = track;
    this.character = character;
    this.name = name;
    this.isBot = isBot;

    const vis = buildKart(character);
    this.visual = vis;
    this.root = vis.root;

    // estado físico
    this.s = 0;
    this.q = 0;
    this.heading = 0;
    this.v = 0;
    this.flip = 0;       // wraps acumulados (cara de la cinta en Möbius)
    this.lapsDone = 0;
    this.maxWrap = 0;    // mayor nº de wrap alcanzado (evita farmear la meta)

    // estado de juego
    this.item = null;
    this.itemRolling = 0;
    this.boostT = 0;
    this.boostPower = 1;
    this.spinT = 0;       // girando tras un golpe
    this.fallT = 0;       // cayendo fuera de la pista
    this.shielded = false;
    this.flippedControls = 0; // Orientation Flip recibido
    this.assistT = 0;     // Geodesic Assist activo
    this.unfoldT = 0;     // Surface Unfolder activo
    this.finished = false;
    this.finishTime = 0;

    // derrape
    this.driftDir = 0;
    this.driftCharge = 0;

    this._frame = {};
    this._wheelSpin = 0;
    this._steerVis = 0;
    this._lastPadHit = new WeakMap();

    // curvatura con signo precalculada
    this._kappaCache = new Map();
  }

  /** curvatura con signo en s: >0 si la pista gira hacia +q (derecha) */
  signedCurvature(s) {
    const tr = this.track;
    const key = Math.round((((s % tr.length) + tr.length) % tr.length) * 2);
    let k = this._kappaCache.get(key);
    if (k === undefined) {
      const f0 = tr.frameAt(s - 2, 0, {});
      const f1 = tr.frameAt(s + 2, 0, {});
      k = f1.T.clone().sub(f0.T).dot(f0.B) / 4;
      this._kappaCache.set(key, k);
    }
    return k;
  }

  get effectiveSpeed() {
    return this.v;
  }

  get totalProgress() { return this.s; }

  get lap() { return Math.max(0, Math.floor(this.maxWrap / this.wrapsPerLap)); }
  get wrapsPerLap() { return 1; }

  /** orientación topológica actual (true = invertida) */
  get orientationFlipped() {
    return this.track.nonOrientable && (((this.flip % 2) + 2) % 2) === 1;
  }

  placeAtGrid(index, count) {
    const w = this.track.widthAt(0);
    const row = Math.floor(index / 2);
    // parrilla justo después de la meta para que flip/orientación empiecen limpios
    this.s = 8 + row * 7;
    this.q = (index % 2 === 0 ? -1 : 1) * w * 0.42;
    this.heading = 0;
    this.v = 0;
    this.flip = 0;
    this.syncVisual(0, 0);
  }

  update(dt, controls, stats = this.character.stats) {
    const tr = this.track;

    if (this.fallT > 0) {
      this.fallT -= dt;
      if (this.fallT <= 0) this._respawn();
      this.syncVisual(0, dt);
      return;
    }

    if (this.spinT > 0) {
      this.spinT -= dt;
      this.v = Math.max(0, this.v - 40 * dt);
      controls = { left: false, right: false, accel: false, brake: false, drift: false };
    }

    if (this.flippedControls > 0) {
      this.flippedControls -= dt;
      const l = controls.left;
      controls = { ...controls, left: controls.right, right: l };
    }

    const w = tr.widthAt(this.s);
    const offroad = Math.abs(this.q) > w - 0.6;
    const falling = Math.abs(this.q) > w + 3.2;
    if (falling && this.fallT <= 0) {
      this.fallT = 1.15;
      this.v = 0;
      return;
    }

    // velocidad objetivo
    let topSpeed = BASE_TOP_SPEED * stats.topSpeed * (offroad ? OFFROAD_FACTOR : 1);
    if (this.boostT > 0) {
      this.boostT -= dt;
      topSpeed *= 1.45 * this.boostPower;
    }

    // aceleración / freno
    if (controls.accel) {
      this.v += BASE_ACCEL * stats.accel * dt * (this.v > topSpeed ? -0.5 : 1);
    } else if (controls.brake) {
      this.v -= BRAKE * dt;
    } else {
      this.v -= Math.sign(this.v) * FRICTION * dt;
      if (Math.abs(this.v) < FRICTION * dt) this.v = 0;
    }
    this.v = THREE.MathUtils.clamp(this.v, -topSpeed * 0.35, Math.max(topSpeed, this.v - 25 * dt));

    // dirección
    let steer = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);

    // derrape: giro más cerrado y carga de miniturbo
    if (controls.drift && Math.abs(this.v) > 14 && steer !== 0) {
      if (this.driftDir === 0) this.driftDir = steer;
      this.driftCharge = Math.min(this.driftCharge + dt, 1.6);
      steer = this.driftDir * 1.45 + steer * 0.35;
    } else {
      if (this.driftDir !== 0 && this.driftCharge > 0.7) {
        // miniturbo al soltar
        this.boostT = Math.max(this.boostT, 0.65 + this.driftCharge * 0.4);
        this.boostPower = 0.85;
      }
      this.driftDir = 0;
      this.driftCharge = 0;
    }

    // asistencia geodésica: empuja suavemente hacia la línea ideal (q≈0)
    if (this.assistT > 0) {
      this.assistT -= dt;
      const ideal = -this.q * 0.04 - this.heading * 0.8;
      steer += THREE.MathUtils.clamp(ideal, -0.5, 0.5);
    }

    const speedFactor = 1 / (1 + Math.abs(this.v) * 0.025);
    const turn = TURN_RATE * stats.handling * (this.driftDir !== 0 ? stats.drift : 1);
    this.heading += steer * turn * speedFactor * dt * Math.sign(this.v || 1);

    // acoplamiento con la curvatura de la pista
    const kappa = this.signedCurvature(this.s);
    const metric = THREE.MathUtils.clamp(1 - this.q * kappa, 0.35, 2.5);
    this.heading -= (kappa * this.v * Math.cos(this.heading) / metric) * dt;
    this.heading = THREE.MathUtils.clamp(this.heading, -1.35, 1.35);
    // amortiguación leve para que el kart tienda a estabilizarse
    this.heading *= Math.exp(-0.45 * dt);

    // integración en coordenadas de carretera
    const prevS = this.s;
    this.s += (this.v * Math.cos(this.heading) / metric) * dt;
    this.q += this.v * Math.sin(this.heading) * dt;
    this.q = THREE.MathUtils.clamp(this.q, -w - 4, w + 4);

    // cruces de meta (wrap)
    const L = tr.length;
    const wrapBefore = Math.floor(prevS / L);
    const wrapAfter = Math.floor(this.s / L);
    if (wrapAfter !== wrapBefore) {
      this.flip += (wrapAfter - wrapBefore);
      if (wrapAfter > this.maxWrap) {
        this.maxWrap = wrapAfter;
        this.onWrap?.(wrapAfter);
      }
    }

    this._wheelSpin += this.v * dt * 1.6;
    this._steerVis = THREE.MathUtils.lerp(this._steerVis, steer, 1 - Math.exp(-8 * dt));
    this.syncVisual(steer, dt);
  }

  _respawn() {
    const L = this.track.length;
    // reaparece en el centro de la pista, un poco atrás
    this.s = this.s - 4;
    this.q = 0;
    this.heading = 0;
    this.v = 0;
    this.fallT = 0;
  }

  forceRespawn() { if (this.fallT <= 0) { this.fallT = 0.001; } }

  hit(spinTime = 1.0) {
    if (this.shielded) {
      this.shielded = false;
      this.visual.shield.visible = false;
      this.onShieldBreak?.();
      return false;
    }
    this.spinT = Math.max(this.spinT, spinTime);
    return true;
  }

  syncVisual(steer, dt) {
    const tr = this.track;
    const fr = tr.frameAt(this.s, this.flip, this._frame);

    const hover = 0.55 + 0.06 * Math.sin(performance.now() * 0.004 + this.s);
    let drop = 0;
    if (this.fallT > 0) {
      const t = 1.15 - this.fallT;
      drop = -t * t * 30;
    }

    const pos = this.root.position;
    pos.copy(fr.pos)
      .addScaledVector(fr.B, this.q)
      .addScaledVector(fr.N, hover + drop);

    // base ortonormal: forward = T rotado heading alrededor de N
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    const fwd = this._fwd ??= new THREE.Vector3();
    fwd.set(
      fr.T.x * cos + fr.B.x * sin,
      fr.T.y * cos + fr.B.y * sin,
      fr.T.z * cos + fr.B.z * sin);
    const up = this._up ??= new THREE.Vector3();
    up.copy(fr.N);
    const right = this._right ??= new THREE.Vector3();
    right.crossVectors(up, fwd).negate(); // x = -(up × fwd) para base RH con z=fwd

    const m = this._mat ??= new THREE.Matrix4();
    m.makeBasis(right, up, fwd);
    const targetQ = this._tq ??= new THREE.Quaternion();
    targetQ.setFromRotationMatrix(m);

    // inclinación al girar + giro de trompo si te han dado
    const rollQ = this._rq ??= new THREE.Quaternion();
    rollQ.setFromAxisAngle(fwd, -this._steerVis * 0.12 * Math.min(1, Math.abs(this.v) / 20));
    targetQ.premultiply(rollQ);
    if (this.spinT > 0) {
      const spinQ = this._sq ??= new THREE.Quaternion();
      spinQ.setFromAxisAngle(up, this.spinT * 12);
      targetQ.premultiply(spinQ);
    }

    if (dt > 0) this.root.quaternion.slerp(targetQ, 1 - Math.exp(-14 * dt));
    else this.root.quaternion.copy(targetQ);

    // ruedas
    for (const [i, wheel] of this.visual.wheels.entries()) {
      wheel.rotation.x = this._wheelSpin;
      if (i < 2) wheel.rotation.y = this._steerVis * 0.4; // delanteras
    }
    // piloto: pequeño rebote y giro de cabeza al derrapar
    this.visual.pilot.rotation.z = -this._steerVis * 0.15;
    this.visual.pilot.position.y = 1.5 + 0.05 * Math.sin(performance.now() * 0.008);

    // llama de turbo
    this.visual.flame.visible = this.boostT > 0;
    if (this.visual.flame.visible) {
      this.visual.flame.scale.setScalar(0.8 + 0.4 * Math.random());
    }
    this.visual.shield.visible = this.shielded;
    if (this.shielded) this.visual.shield.rotation.y += dt * 2;
  }
}
