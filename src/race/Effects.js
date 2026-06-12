import * as THREE from 'three';

let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _dotTex = new THREE.CanvasTexture(c);
  return _dotTex;
}

/**
 * Sistema de partículas ligero: ráfagas de Points con velocidad,
 * gravedad local y desvanecimiento. Para chispas de derrape, explosiones
 * de cajas, confeti de meta e impactos.
 */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
  }

  /**
   * @param {Object} o {pos, normal, count, colors, speed, life, size, spread, gravity, dir}
   */
  burst({
    pos, normal = new THREE.Vector3(0, 1, 0), dir = null,
    count = 18, colors = [0xffd23f], speed = 12, life = 0.7,
    size = 0.55, spread = 1, gravity = 26,
  }) {
    const positions = new Float32Array(count * 3);
    const colorArr = new Float32Array(count * 3);
    const velocities = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions.set([pos.x, pos.y, pos.z], i * 3);
      c.set(colors[i % colors.length]);
      colorArr.set([c.r, c.g, c.b], i * 3);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread);
      v.addScaledVector(normal, 0.6 + Math.random() * 0.7);
      if (dir) v.addScaledVector(dir, 0.8 + Math.random() * 0.5);
      v.normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      velocities.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    const mat = new THREE.PointsMaterial({
      map: dotTexture(), size, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.systems.push({
      points, velocities, age: 0, life,
      gravity: normal.clone().multiplyScalar(-gravity),
    });
  }

  update(dt) {
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const s = this.systems[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.scene.remove(s.points);
        s.points.geometry.dispose();
        s.points.material.dispose();
        this.systems.splice(i, 1);
        continue;
      }
      const attr = s.points.geometry.getAttribute('position');
      for (let p = 0; p < s.velocities.length; p++) {
        const v = s.velocities[p];
        v.addScaledVector(s.gravity, dt);
        attr.array[p * 3] += v.x * dt;
        attr.array[p * 3 + 1] += v.y * dt;
        attr.array[p * 3 + 2] += v.z * dt;
      }
      attr.needsUpdate = true;
      s.points.material.opacity = 1 - (s.age / s.life) ** 1.5;
    }
  }

  dispose() {
    for (const s of this.systems) {
      this.scene.remove(s.points);
      s.points.geometry.dispose();
      s.points.material.dispose();
    }
    this.systems = [];
  }
}

export const SPARK_COLORS = {
  drift: [0xffd23f, 0xff9a3c, 0xffffff],
  driftCharged: [0x46d5ff, 0x7dffea, 0xffffff],
  edge: [0xffd23f, 0xffffff],
  boost: [0x46d5ff, 0x7c6bff, 0xffffff],
  boxExplode: [0x46d5ff, 0xff5d8f, 0xffd23f, 0x4ade80, 0xb07cff],
  hit: [0xff5d5d, 0xffd23f],
  confetti: [0xff5d8f, 0x46d5ff, 0xffd23f, 0x4ade80, 0xb07cff, 0xffffff],
};
