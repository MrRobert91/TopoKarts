import * as THREE from 'three';
import { buildKart } from './KartVisual.js';

const BASE_TOP_SPEED = 46;     // m/s
const BASE_ACCEL = 34;
const BRAKE = 60;
const FRICTION = 16;
const TURN_RATE = 2.1;         // rad/s
const CENTER_RATE = 2.4;       // auto-alineado con la pista (sensación arcade)
const MAX_HEADING = 0.85;      // el kart nunca queda atravesado

/**
 * Kart en coordenadas de carretera (s, q, heading).
 * Modelo arcade: el heading se auto-centra hacia la dirección de la pista,
 * así que girar desplaza lateralmente y soltar endereza. El kart está
 * SIEMPRE pegado a la superficie (no hay caídas que atraviesen el suelo):
 * los bordes de las cintas son barreras con chispas.
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
    this.qTotal = 0;       // acumulado (ciclo B en el toro)
    this.heading = 0;
    this.steerS = 0;       // volante suavizado
    this.v = 0;
    this.flip = 0;
    this.maxWrap = 0;

    // estado de juego
    this.item = null;
    this.itemRolling = 0;
    this.boostT = 0;
    this.boostPower = 1;
    this.spinT = 0;
    this.fallT = 0;        // animación de respawn manual
    this.shielded = false;
    this.flippedControls = 0;
    this.assistT = 0;
    this.unfoldT = 0;
    this.finished = false;
    this.finishTime = 0;

    this.driftDir = 0;
    this.driftCharge = 0;

    // flags de efectos para Race (chispas, etc.)
    this.fx = { edge: false, drift: false, landed: false };

    this._frame = {};
    this._wheelSpin = 0;
    this._steerVis = 0;
  }

  signedCurvature(s) { return this.track.signedCurvature(s); }

  get lap() { return Math.max(0, this.maxWrap); }

  get orientationFlipped() {
    return this.track.nonOrientable && (((this.flip % 2) + 2) % 2) === 1;
  }

  placeAtGrid(index) {
    const row = Math.floor(index / 2);
    const w = this.track.isSurface ? this.track.bandHalf : this.track.widthAt(0);
    this.s = 8 + row * 7;
    this.q = (index % 2 === 0 ? -1 : 1) * w * 0.42;
    this.qTotal = this.q;
    this.heading = 0;
    this.v = 0;
    this.flip = 0;
    this.syncVisual(0);
  }

  update(dt, controls, stats = this.character.stats) {
    const tr = this.track;
    this.fx.edge = false;
    this.fx.drift = false;

    if (this.fallT > 0) {
      this.fallT -= dt;
      if (this.fallingOff) {
        // sigue la inercia mientras cae al vacío
        this.s += this.v * 0.4 * Math.cos(this.heading) * dt;
        this.q += Math.sign(this.q || 1) * 7 * dt;
      }
      if (this.fallT <= 0) this._respawn();
      this.syncVisual(dt);
      return;
    }

    if (this.spinT > 0) {
      this.spinT -= dt;
      this.v = Math.max(0, this.v - 42 * dt);
      controls = { left: false, right: false, accel: false, brake: false, drift: false };
    }

    if (this.flippedControls > 0) {
      this.flippedControls -= dt;
      const l = controls.left;
      controls = { ...controls, left: controls.right, right: l };
    }

    // ── velocidad ──
    const offroad = tr.offroadFactor(this.s, this.q);
    let topSpeed = BASE_TOP_SPEED * stats.topSpeed * offroad;
    if (this.boostT > 0) {
      this.boostT -= dt;
      topSpeed *= 1.42 * this.boostPower;
    }
    if (controls.accel) {
      this.v += BASE_ACCEL * stats.accel * dt;
    } else if (controls.brake) {
      this.v -= BRAKE * dt;
    } else {
      this.v -= Math.sign(this.v) * FRICTION * dt;
      if (Math.abs(this.v) < FRICTION * dt) this.v = 0;
    }
    // límite suave: por encima de topSpeed decae, nunca se corta de golpe
    if (this.v > topSpeed) this.v = Math.max(topSpeed, this.v - 38 * dt);
    if (this.v < -topSpeed * 0.35) this.v = -topSpeed * 0.35;

    // ── dirección (modelo arcade estable) ──
    let steerInput = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);

    // derrape: mantiene un sesgo de giro y carga miniturbo
    if (controls.drift && Math.abs(this.v) > 13 && (steerInput !== 0 || this.driftDir !== 0)) {
      if (this.driftDir === 0 && steerInput !== 0) this.driftDir = steerInput;
      if (this.driftDir !== 0) {
        this.driftCharge = Math.min(this.driftCharge + dt, 1.6);
        steerInput = this.driftDir * 1.15 + steerInput * 0.45;
        this.fx.drift = this.driftCharge > 0.15;
      }
    } else {
      if (this.driftDir !== 0 && this.driftCharge > 0.6) {
        this.boostT = Math.max(this.boostT, 0.55 + this.driftCharge * 0.45);
        this.boostPower = Math.max(this.boostPower, 0.9);
        this.fx.miniturbo = true;
      }
      this.driftDir = 0;
      this.driftCharge = 0;
    }

    // asistencia geodésica: lleva suavemente hacia la línea ideal
    if (this.assistT > 0) {
      this.assistT -= dt;
      steerInput += THREE.MathUtils.clamp(-this.q * 0.05 - this.heading * 1.2, -0.6, 0.6);
    }

    // volante suavizado → heading con auto-centrado fuerte
    this.steerS += (THREE.MathUtils.clamp(steerInput, -1.6, 1.6) - this.steerS) * Math.min(1, 10 * dt);
    const speedK = THREE.MathUtils.clamp(Math.abs(this.v) / 12, 0.15, 1) // casi no gira parado
      / (1 + Math.abs(this.v) * 0.013);                                  // y menos a tope
    const driftBonus = this.driftDir !== 0 ? stats.drift : 1;
    this.heading += this.steerS * TURN_RATE * stats.handling * driftBonus * speedK * dt * Math.sign(this.v || 1);
    this.heading -= this.heading * Math.min(1, CENTER_RATE * dt); // la pista "endereza" el kart
    this.heading = THREE.MathUtils.clamp(this.heading, -MAX_HEADING, MAX_HEADING);

    // ── integración sobre la superficie ──
    const metric = tr.metricAt(this.s, this.q);
    const prevS = this.s;
    this.s += (this.v * Math.cos(this.heading) / metric) * dt;
    let dq = this.v * Math.sin(this.heading) * dt;
    if (this.driftDir !== 0) dq += this.driftDir * Math.abs(this.v) * 0.16 * dt; // deslizamiento
    this.q += dq;
    this.qTotal += dq;

    if (tr.lateralPeriod) {
      // superficie cerrada: q envuelve (toro: alrededor del tubo)
      const P = tr.lateralPeriod;
      if (this.q > P / 2) this.q -= P;
      if (this.q < -P / 2) this.q += P;
      if (tr.kind === 'sphere') {
        // suave empuje hacia la banda antes del "polo lateral"
        const lim = P * 0.21;
        if (Math.abs(this.q) > lim) {
          this.q -= Math.sign(this.q) * (Math.abs(this.q) - lim) * Math.min(1, 3 * dt);
          this.heading -= Math.sign(this.q) * 0.5 * dt;
        }
      }
    } else {
      // cinta: barrera con chispas… salvo en los huecos, donde TE CAES
      const w = tr.widthAt(this.s);
      const lim = w - 1.0;
      if (Math.abs(this.q) > lim) {
        const side = Math.sign(this.q);
        if (tr.hasBarrier(this.s, side)) {
          this.q = side * lim;
          if (Math.abs(this.v) > 8) {
            this.fx.edge = true;
            this.v *= 1 - 1.6 * dt;
          }
          if (Math.sign(this.heading) === side) this.heading *= 1 - Math.min(1, 8 * dt);
        } else if (Math.abs(this.q) > w + 2.0) {
          this.fallingOff = true;
          this.fallT = 1.35;
          this.fx.fall = true;
        }
      }
    }

    // cruces de meta
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
    this._steerVis += (this.steerS - this._steerVis) * Math.min(1, 9 * dt);
    this.syncVisual(dt);
  }

  _respawn() {
    this.q = 0;
    this.heading = 0;
    this.steerS = 0;
    this.v = 0;
    this.fallT = 0;
    this.spinT = 0;
    this.fallingOff = false;
  }

  forceRespawn() { if (this.fallT <= 0) this.fallT = 0.6; }

  hit(spinTime = 1.0) {
    if (this.shielded) {
      this.shielded = false;
      this.visual.shield.visible = false;
      this.onShieldBreak?.();
      return false;
    }
    if (spinTime > 0) this.spinT = Math.max(this.spinT, spinTime);
    return true;
  }

  syncVisual(dt) {
    const tr = this.track;
    const fr = tr.surfaceFrame(this.s, this.q, this.flip, this._frame);

    const hover = 0.52 + 0.05 * Math.sin(performance.now() * 0.004 + this.s);
    let sink = 0;
    if (this.fallT > 0) {
      if (this.fallingOff) {
        const t = 1.35 - this.fallT;
        sink = t * t * 42; // caída al vacío acelerando
      } else {
        sink = Math.sin((0.6 - this.fallT) * 5.2) * 1.2; // "hundido" de respawn manual
      }
    }

    this.root.position.copy(fr.pos).addScaledVector(fr.N, hover - sink);

    // base ortonormal: forward = T rotado heading alrededor de N
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    const fwd = this._fwd ??= new THREE.Vector3();
    fwd.set(
      fr.T.x * cos + fr.B.x * sin,
      fr.T.y * cos + fr.B.y * sin,
      fr.T.z * cos + fr.B.z * sin);
    const up = this._up ??= new THREE.Vector3();
    up.copy(fr.N);
    // base ORTONORMAL DIRECTA (det +1): x = up × fwd. Con la base reflejada
    // (det −1) setFromRotationMatrix produce cuaterniones corruptos y el
    // kart "gira en círculos" según rota el marco de la pista.
    const xAxis = this._right ??= new THREE.Vector3();
    xAxis.crossVectors(up, fwd);

    const m = this._mat ??= new THREE.Matrix4();
    m.makeBasis(xAxis, up, fwd);
    const targetQ = this._tq ??= new THREE.Quaternion();
    targetQ.setFromRotationMatrix(m);

    // derrape: el kart se pone "de lado" visualmente
    if (this.driftDir !== 0) {
      const yawQ = this._yq ??= new THREE.Quaternion();
      yawQ.setFromAxisAngle(up, -this.driftDir * 0.35);
      targetQ.premultiply(yawQ);
    }
    // inclinación al girar
    const rollQ = this._rq ??= new THREE.Quaternion();
    rollQ.setFromAxisAngle(fwd, -this._steerVis * 0.14 * Math.min(1, Math.abs(this.v) / 22));
    targetQ.premultiply(rollQ);
    // voltereta al caer al vacío
    if (this.fallingOff && this.fallT > 0) {
      const tumQ = this._tumQ ??= new THREE.Quaternion();
      tumQ.setFromAxisAngle(xAxis, (1.35 - this.fallT) * 2.6);
      targetQ.premultiply(tumQ);
    }
    // trompo tras un golpe
    if (this.spinT > 0) {
      const spinQ = this._sq ??= new THREE.Quaternion();
      spinQ.setFromAxisAngle(up, this.spinT * 11);
      targetQ.premultiply(spinQ);
    }

    if (dt > 0) this.root.quaternion.slerp(targetQ, Math.min(1, 16 * dt));
    else this.root.quaternion.copy(targetQ);

    for (const [i, wheel] of this.visual.wheels.entries()) {
      wheel.rotation.x = this._wheelSpin;
      if (i < 2) wheel.rotation.y = this._steerVis * 0.42;
    }
    this.visual.pilot.rotation.z = -this._steerVis * 0.16;
    this.visual.pilot.position.y = 1.5 + 0.05 * Math.sin(performance.now() * 0.008);

    this.visual.flame.visible = this.boostT > 0;
    if (this.visual.flame.visible) {
      this.visual.flame.scale.setScalar(0.8 + 0.4 * Math.random());
      this.visual.flame.material.color.setHSL(0.52 - Math.random() * 0.07, 1, 0.6);
    }
    this.visual.shield.visible = this.shielded;
    if (this.shielded && dt > 0) this.visual.shield.rotation.y += dt * 2;
  }
}
