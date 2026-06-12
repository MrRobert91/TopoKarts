import * as THREE from 'three';

/**
 * Una pista de TopoKarts es, o bien:
 *
 *  A) una CINTA ("ribbon"): curva cerrada en R^3 con marco móvil por
 *     transporte paralelo + torsión extra theta(s). Con twistTurns=0.5 la
 *     cinta es una banda de Möbius y la inversión de orientación emerge
 *     de la geometría.
 *
 *  B) una SUPERFICIE completa ("sphere" | "torus"): el kart puede moverse
 *     por TODA la superficie. La coordenada lateral q (en metros) es
 *     periódica: en el toro, q recorre el tubo; en la esfera, q te saca
 *     del círculo máximo de carrera hacia los "polos laterales".
 *
 * Interfaz común usada por física, cámara y constructor visual:
 *   surfaceFrame(s, q, flip) -> {pos, T, N, B} en el punto del kart
 *   lateralPeriod  (m | null)   metricAt(s, q)   offroadFactor(s, q)
 *   widthAt(s)     gaussianAt(s, q)              signedCurvature(s)
 */
export class Track {
  constructor(def) {
    this.def = def;
    this.surface = def.surface ?? null;
    this.halfWidth = def.halfWidth ?? 9;
    this.bandHalf = def.bandHalf ?? 10;
    this.twistTurns = def.twistTurns ?? 0;
    this.samples = def.samples ?? 1200;
    this._kappaCache = new Map();

    if (this.surface?.type === 'sphere') {
      this.kind = 'sphere';
      this.R = this.surface.R;
      this.length = Math.PI * 2 * this.R;
      this.latRadius = this.R;
      this.lateralPeriod = Math.PI * 2 * this.R;
      this._samplePositions();
    } else if (this.surface?.type === 'torus') {
      this.kind = 'torus';
      this.R = this.surface.R;
      this.r = this.surface.r;
      this.length = Math.PI * 2 * this.R;
      this.latRadius = this.r;
      this.lateralPeriod = Math.PI * 2 * this.r;
      this._samplePositions();
    } else {
      this.kind = 'ribbon';
      this.lateralPeriod = null;
      this.curve = new THREE.CatmullRomCurve3(def.points, true, 'centripetal', 0.5);
      this._buildFrames();
    }
  }

  get isSurface() { return this.kind !== 'ribbon'; }
  get nonOrientable() {
    return this.kind === 'ribbon' && Math.abs(((this.twistTurns % 1) + 1) % 1 - 0.5) < 1e-9;
  }

  _samplePositions() {
    // posiciones de la línea de carrera (q=0) para el minimapa "normal"
    this.positions = [];
    const t = {};
    for (let i = 0; i < 256; i++) {
      this.surfaceFrame((i / 256) * this.length, 0, 0, t);
      this.positions.push(t.pos.clone());
    }
  }

  // ── marco sobre la superficie ──────────────────────────────────────
  surfaceFrame(s, q, flip = 0, target = {}) {
    target.pos ??= new THREE.Vector3();
    target.T ??= new THREE.Vector3();
    target.N ??= new THREE.Vector3();
    target.B ??= new THREE.Vector3();

    if (this.kind === 'sphere') {
      const R = this.R;
      const th = s / R, a = q / R;
      const ct = Math.cos(th), st = Math.sin(th);
      const ca = Math.cos(a), sa = Math.sin(a);
      target.pos.set(R * st * ca, R * ct * ca, R * sa);
      target.T.set(ct, -st, 0);
      target.N.copy(target.pos).multiplyScalar(1 / R);
      target.B.set(-st * sa, -ct * sa, ca);
      return target;
    }
    if (this.kind === 'torus') {
      const { R, r } = this;
      const th = s / R, a = q / r;
      const ct = Math.cos(th), st = Math.sin(th);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ring = R + r * ca;
      target.pos.set(ring * ct, r * sa, ring * st);
      target.T.set(-st, 0, ct);
      target.N.set(ca * ct, sa, ca * st);
      target.B.set(-ct * sa, ca, -st * sa);
      return target;
    }
    // ribbon
    this.frameAt(s, flip, target);
    target.pos.addScaledVector(target.B, q);
    return target;
  }

  /** factor ds_mundo / ds_parámetro en (s,q) */
  metricAt(s, q) {
    if (this.kind === 'sphere') return Math.max(Math.cos(q / this.R), 0.35);
    if (this.kind === 'torus') return Math.max((this.R + this.r * Math.cos(q / this.r)) / this.R, 0.3);
    return THREE.MathUtils.clamp(1 - q * this.signedCurvature(s), 0.4, 2.5);
  }

  /** penalización de velocidad fuera de la zona ideal */
  offroadFactor(s, q) {
    if (this.isSurface) return Math.abs(q) > this.bandHalf ? 0.82 : 1;
    return Math.abs(q) > this.widthAt(s) - 0.6 ? 0.45 : 1;
  }

  /** curvatura gaussiana aproximada (para Curvature Boost y HUD) */
  gaussianAt(s, q) {
    if (this.kind === 'sphere') return 1 / (this.R * this.R);
    if (this.kind === 'torus') {
      const a = q / this.r;
      return Math.cos(a) / (this.r * (this.R + this.r * Math.cos(a)));
    }
    const k = this.curvatureAt(s);
    return k * k;
  }

  widthAt(s) {
    if (this.isSurface) return this.lateralPeriod / 2;
    if (!this.def.widthFn) return this.halfWidth;
    return this.def.widthFn(((s % this.length) + this.length) % this.length, this.length, this.halfWidth);
  }

  /** curvatura con signo de la línea de carrera (>0 gira hacia +q). 0 en superficies. */
  signedCurvature(s) {
    if (this.isSurface) return 0;
    const key = Math.round((((s % this.length) + this.length) % this.length) * 2);
    let k = this._kappaCache.get(key);
    if (k === undefined) {
      const f0 = this.frameAt(s - 2, 0, {});
      const f1 = this.frameAt(s + 2, 0, {});
      k = f1.T.clone().sub(f0.T).dot(f0.B) / 4;
      this._kappaCache.set(key, k);
    }
    return k;
  }

  curvatureAt(s) {
    if (this.kind === 'sphere') return 1 / this.R;
    if (this.kind === 'torus') return 1 / this.R;
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

  // ── marco del eje (q=0) ────────────────────────────────────────────
  frameAt(s, flip = 0, target = {}) {
    if (this.isSurface) {
      // marco del eje de carrera; flip no aplica
      return this.surfaceFrame(s, 0, 0, target);
    }
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

  worldPoint(s, q, flip = 0, height = 0, target = new THREE.Vector3()) {
    const fr = this.surfaceFrame(s, q, flip, this._tmpFrame ??= {});
    return target.copy(fr.pos).addScaledVector(fr.N, height);
  }

  twistAt(s) {
    if (this.isSurface) return 0;
    const sm = ((s % this.length) + this.length) % this.length;
    return (sm / this.length) * this.twistCorrection;
  }

  // ── construcción de marcos (solo ribbon) ──────────────────────────
  _buildFrames() {
    const n = this.samples;
    this.positions = [];
    this.tangents = [];
    this.normals = [];
    this.binormals = [];
    this.arcLen = [0];

    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.positions.push(this.curve.getPointAt(t));
      this.tangents.push(this.curve.getTangentAt(t).normalize());
    }
    for (let i = 1; i <= n; i++) {
      const a = this.positions[i - 1];
      const b = this.positions[i % n];
      this.arcLen.push(this.arcLen[i - 1] + a.distanceTo(b));
    }
    this.length = this.arcLen[n];

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
    const mismatch = Math.atan2(endNormal.dot(refB), endNormal.dot(ref));
    const targetTwist = this.twistTurns * Math.PI * 2;
    this.twistCorrection = targetTwist - mismatch;
  }

  _sampleIndex(s) {
    const sm = ((s % this.length) + this.length) % this.length;
    let lo = 0, hi = this.samples;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.arcLen[mid] <= sm) lo = mid; else hi = mid;
    }
    const span = this.arcLen[hi] - this.arcLen[lo];
    const f = span > 0 ? (sm - this.arcLen[lo]) / span : 0;
    return lo + f;
  }
}
