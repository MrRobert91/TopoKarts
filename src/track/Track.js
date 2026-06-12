import * as THREE from 'three';

/**
 * Una pista de TopoKarts es una curva cerrada en R^3 con un marco móvil
 * (tangente T, normal "up" N, lateral B) calculado por transporte paralelo,
 * más una función de torsión extra theta(s).
 *
 * Para la cinta de Möbius, twistTurns = 0.5: tras una vuelta completa el
 * marco queda rotado pi alrededor de la tangente, así que el kart vuelve
 * "por la otra cara" de la misma cinta. La inversión de orientación sale
 * directamente de la geometría, sin casos especiales en la física.
 */
export class Track {
  /**
   * @param {Object} def definición del circuito (ver circuits.js)
   */
  constructor(def) {
    this.def = def;
    this.curve = new THREE.CatmullRomCurve3(def.points, true, 'centripetal', 0.5);
    this.samples = def.samples ?? 1200;
    this.twistTurns = def.twistTurns ?? 0; // 0.5 => banda de Möbius
    this.halfWidth = def.halfWidth ?? 9;
    this._buildFrames();
  }

  _buildFrames() {
    const n = this.samples;
    this.positions = [];
    this.tangents = [];
    this.normals = [];   // up local (antes de torsión)
    this.binormals = []; // lateral local (antes de torsión)
    this.arcLen = [0];

    // muestreo equiespaciado en el parámetro de la curva (suficiente con centripetal)
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.positions.push(this.curve.getPointAt(t));
      this.tangents.push(this.curve.getTangentAt(t).normalize());
    }
    // longitud de arco acumulada
    for (let i = 1; i <= n; i++) {
      const a = this.positions[i - 1];
      const b = this.positions[i % n];
      this.arcLen.push(this.arcLen[i - 1] + a.distanceTo(b));
    }
    this.length = this.arcLen[n];

    // transporte paralelo de la normal a lo largo de la curva
    let normal = new THREE.Vector3(0, 1, 0);
    const t0 = this.tangents[0];
    normal.sub(t0.clone().multiplyScalar(normal.dot(t0))).normalize();
    if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);

    for (let i = 0; i < n; i++) {
      const T = this.tangents[i];
      normal = normal.clone().sub(T.clone().multiplyScalar(normal.dot(T))).normalize();
      this.normals.push(normal);
      this.binormals.push(new THREE.Vector3().crossVectors(T, normal).normalize());
      if (i < n - 1) {
        // rotar la normal hacia el plano del siguiente tangente
        const T2 = this.tangents[i + 1];
        const axis = new THREE.Vector3().crossVectors(T, T2);
        const sin = axis.length();
        if (sin > 1e-8) {
          axis.normalize();
          const angle = Math.asin(THREE.MathUtils.clamp(sin, -1, 1));
          normal = normal.clone().applyAxisAngle(axis, angle);
        }
      }
    }

    // desajuste de cierre: ángulo entre la normal transportada al final y la inicial
    const Tend = this.tangents[0];
    let endNormal = this.normals[n - 1].clone();
    const Tprev = this.tangents[n - 1];
    const axis = new THREE.Vector3().crossVectors(Tprev, Tend);
    if (axis.length() > 1e-8) {
      endNormal.applyAxisAngle(axis.clone().normalize(), Math.asin(THREE.MathUtils.clamp(axis.length(), -1, 1)));
    }
    endNormal.sub(Tend.clone().multiplyScalar(endNormal.dot(Tend))).normalize();
    const ref = this.normals[0];
    const refB = this.binormals[0];
    let mismatch = Math.atan2(endNormal.dot(refB), endNormal.dot(ref));
    // torsión total deseada (Möbius: pi). Corregimos el desajuste repartiéndolo.
    const targetTwist = this.twistTurns * Math.PI * 2;
    this.twistCorrection = targetTwist - mismatch; // se aplica linealmente con s
  }

  /** índice flotante de muestra para una longitud de arco s (con wrap) */
  _sampleIndex(s) {
    let sm = ((s % this.length) + this.length) % this.length;
    // búsqueda binaria en arcLen
    let lo = 0, hi = this.samples;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.arcLen[mid] <= sm) lo = mid; else hi = mid;
    }
    const span = this.arcLen[hi] - this.arcLen[lo];
    const f = span > 0 ? (sm - this.arcLen[lo]) / span : 0;
    return lo + f;
  }

  /** ángulo de torsión total en s (transporte + torsión topológica) */
  twistAt(s) {
    const sm = ((s % this.length) + this.length) % this.length;
    return (sm / this.length) * this.twistCorrection;
  }

  /**
   * Marco en s. `flip` = número de "vueltas de cara" acumuladas (cinta de
   * Möbius: cada wrap suma 1 y el marco gira pi extra).
   * Devuelve {pos, T, N, B} con N = up local, B = lateral (derecha).
   */
  frameAt(s, flip = 0, target = {}) {
    const fi = this._sampleIndex(s);
    const i0 = Math.floor(fi) % this.samples;
    const i1 = (i0 + 1) % this.samples;
    const f = fi - Math.floor(fi);

    const pos = (target.pos ??= new THREE.Vector3()).lerpVectors(this.positions[i0], this.positions[i1], f);
    const T = (target.T ??= new THREE.Vector3()).lerpVectors(this.tangents[i0], this.tangents[i1], f).normalize();
    const N0 = (target.N ??= new THREE.Vector3()).lerpVectors(this.normals[i0], this.normals[i1], f).normalize();
    const B0 = (target.B ??= new THREE.Vector3()).lerpVectors(this.binormals[i0], this.binormals[i1], f).normalize();

    const theta = this.twistAt(s) + flip * this.twistTurns * Math.PI * 2;
    if (theta !== 0) {
      const c = Math.cos(theta), sn = Math.sin(theta);
      const nx = N0.x * c + B0.x * sn, ny = N0.y * c + B0.y * sn, nz = N0.z * c + B0.z * sn;
      const bx = B0.x * c - N0.x * sn, by = B0.y * c - N0.y * sn, bz = B0.z * c - N0.z * sn;
      N0.set(nx, ny, nz); B0.set(bx, by, bz);
    }
    target.pos = pos; target.T = T; target.N = N0; target.B = B0;
    return target;
  }

  /** posición en el mundo para coordenadas de carretera (s, q) y cara flip */
  worldPoint(s, q, flip = 0, height = 0, target = new THREE.Vector3()) {
    const fr = this.frameAt(s, flip, this._tmpFrame ??= {});
    return target.copy(fr.pos)
      .addScaledVector(fr.B, q)
      .addScaledVector(fr.N, height);
  }

  /** ¿la pista es no orientable? (la cara se invierte en cada vuelta) */
  get nonOrientable() { return Math.abs((this.twistTurns % 1 + 1) % 1 - 0.5) < 1e-9; }

  /** anchura de pista en s (permite estrechamientos definidos por el circuito) */
  widthAt(s) {
    if (!this.def.widthFn) return this.halfWidth;
    return this.def.widthFn(((s % this.length) + this.length) % this.length, this.length, this.halfWidth);
  }

  /** curvatura aproximada en s (1/radio), para Curvature Boost y HUD */
  curvatureAt(s) {
    const fi = Math.floor(this._sampleIndex(s));
    const i0 = (fi - 2 + this.samples) % this.samples;
    const i1 = fi % this.samples;
    const i2 = (fi + 2) % this.samples;
    const a = this.positions[i0], b = this.positions[i1], c = this.positions[i2];
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
    const area2 = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length();
    const denom = ab * bc * ca;
    return denom > 1e-9 ? (2 * area2) / denom : 0;
  }
}
