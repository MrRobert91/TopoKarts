import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { klein } from 'three/addons/geometries/ParametricFunctions.js';
import { textSprite } from './textures.js';

/**
 * Decorado matemático de fondo: a lo largo de TODA la pista hay criaturas
 * low-poly (dragones, robots, dinosaurios) y visualizaciones famosas de las
 * matemáticas (Mandelbrot, Sierpinski, Hopf, Klein, Koch, Voronoi, Chladni,
 * Penrose, Ulam, Feynman, Riemann, Lorenz). Todo con volumen y color sólido.
 */
export function addMathDecor(ts) {
  const tr = ts.track;
  const off = (tr.isSurface ? tr.bandHalf : tr.halfWidth) + 34;

  // [sFrac, builder, ladoYdistancia, altura, radioObjeto, pegadoAlSuelo]
  const PLACEMENTS = [
    [0.04, mandelbrotSlab, off + 18, 16, 13],
    [0.08, dragon, -(off + 30), 26, 36],
    [0.12, sierpinskiTetra, -(off + 16), 12, 10],
    [0.16, robot, off + 14, 0, 8, true],
    [0.20, hopfFibration, off + 24, 20, 14],
    [0.24, shapeShoal, -(off + 26), 22, 22],
    [0.28, kleinBottle, -(off + 20), 16, 17],
    [0.36, kochSnowflake, off + 18, 16, 12],
    [0.40, dino, -(off + 18), 0, 10, true],
    [0.44, voronoiSlab, -(off + 22), 15, 13],
    [0.52, chladniPlate, off + 22, 14, 12],
    [0.58, lorenzTube, -(off + 40), 22, 32],
    [0.62, dragon, off + 34, 30, 36],
    [0.66, penroseSlab, off + 18, 16, 12],
    [0.70, robot, -(off + 14), 0, 8, true],
    [0.74, ulamSlab, -(off + 18), 15, 12],
    [0.82, feynmanDiagram, off + 22, 18, 16],
    [0.86, dino, off + 16, 0, 10, true],
    [0.90, riemannSphere, -(off + 24), 14, 18],
    [0.95, shapeShoal, off + 28, 24, 22],
  ];
  for (const [s, fn, lat, h, objR, ground] of PLACEMENTS) {
    fn(ts, findClearSpot(ts, s, lat, h, objR, ground));
  }
}

/** distancia libre desde pos a la pista (otros tramos) y al cuerpo de la superficie */
function clearanceAt(tr, pos, sOwn) {
  let clear = 1e9;
  if (tr.kind === 'sphere') {
    clear = pos.length() - tr.R;
  } else if (tr.kind === 'torus') {
    const ring = Math.hypot(pos.x, pos.z);
    clear = Math.hypot(ring - tr.R, pos.y) - tr.r;
  }
  const fr = {};
  const L = tr.length;
  for (let s = 0; s < L; s += 7) {
    let ds = Math.abs(s - sOwn);
    ds = Math.min(ds, L - ds);
    if (ds < 50) continue; // el tramo propio no cuenta: ahí queremos estar cerca
    tr.surfaceFrame(s, 0, 0, fr);
    clear = Math.min(clear, pos.distanceTo(fr.pos));
  }
  return clear;
}

/**
 * En cintas retorcidas (Möbius, doble toro…) un offset lateral grande puede
 * caer encima de otro tramo de pista. Prueba posiciones cada vez más lejanas
 * o altas hasta encontrar hueco libre.
 */
function findClearSpot(ts, sFrac, lat, h, objR, ground = false) {
  const tr = ts.track;
  const margin = objR + (tr.isSurface ? 6 : tr.halfWidth + 5);
  const tries = ground
    ? [[1, 0], [1.25, 0], [1.55, 0], [1.9, 0], [2.4, 0], [-1.2, 0]]
    : [[1, 0], [1, 18], [1.3, 10], [1.3, 28], [1.7, 16], [1.7, 40], [1, 48], [2.3, 24]];
  let best = null, bestClear = -1e9;
  for (const [mul, add] of tries) {
    const spot = ts._spot(sFrac, lat * mul, h + add);
    const clear = clearanceAt(tr, spot.pos, sFrac * tr.length);
    if (clear >= margin) return spot;
    if (clear > bestClear) { bestClear = clear; best = spot; }
  }
  return best;
}

// ── utilidades ───────────────────────────────────────────────────────
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTex(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const matte = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.95, metalness: 0, flatShading: true, ...extra,
});

function label(ts, spot, text, dy) {
  const sp = textSprite(text, { color: '#ffd23f' });
  sp.scale.set(17, 4.25, 1);
  sp.position.copy(spot.pos).addScaledVector(spot.f.N, dy);
  ts.group.add(sp);
}

/** losa gruesa con una textura matemática por las dos caras */
function slab(ts, spot, tex, name, size = 20) {
  const edge = matte(0x1a1d30);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, 1.6),
    [edge, edge, edge, edge, face, face]);
  mesh.position.copy(spot.pos);
  // de pie sobre la normal local, cara hacia la pista
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    spot.f.T.clone().multiplyScalar(-spot.side), spot.f.N, spot.f.B.clone().multiplyScalar(-spot.side)));
  // marco grueso
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 2, size + 2, 1.0), matte(0x3a4060));
  frame.position.z = -0.1;
  mesh.add(frame);
  ts.group.add(mesh);
  label(ts, spot, name, -size * 0.5 - 4.5);
  return mesh;
}

// ════ VISUALIZACIONES MATEMÁTICAS ════════════════════════════════════

/** Conjunto de Mandelbrot */
function mandelbrotSlab(ts, spot) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const col = new THREE.Color();
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const cr = (px / S) * 3.0 - 2.15, ci = (py / S) * 3.0 - 1.5;
      let zr = 0, zi = 0, n = 0;
      const MAX = 48;
      while (n < MAX && zr * zr + zi * zi < 4) {
        const t = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci; zr = t; n++;
      }
      const k = (py * S + px) * 4;
      if (n >= MAX) { img.data[k] = 8; img.data[k + 1] = 8; img.data[k + 2] = 18; }
      else {
        col.setHSL(0.62 - (n / MAX) * 0.55, 0.85, 0.28 + (n / MAX) * 0.45);
        img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255;
      }
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  slab(ts, spot, canvasTex(c), 'MANDELBROT');
}

/** Diagrama de Voronoi */
function voronoiSlab(ts, spot) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const PAL = [0xef4444, 0x3b82f6, 0xeab308, 0x4ade80, 0xf97316, 0x8b5cf6, 0x46d5ff, 0xff5d8f];
  const seeds = [];
  for (let i = 0; i < 26; i++) {
    seeds.push({ x: Math.random() * S, y: Math.random() * S, c: new THREE.Color(PAL[i % PAL.length]) });
  }
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let d1 = 1e9, d2 = 1e9, best = seeds[0];
      for (const sd of seeds) {
        const d = (sd.x - px) ** 2 + (sd.y - py) ** 2;
        if (d < d1) { d2 = d1; d1 = d; best = sd; }
        else if (d < d2) d2 = d;
      }
      const border = Math.sqrt(d2) - Math.sqrt(d1) < 2.6;
      const k = (py * S + px) * 4;
      const dim = border ? 0.12 : 0.55 + 0.35 * (1 - Math.sqrt(d1) / 60);
      img.data[k] = best.c.r * 255 * dim;
      img.data[k + 1] = best.c.g * 255 * dim;
      img.data[k + 2] = best.c.b * 255 * dim;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // marcar las semillas
  g.fillStyle = '#ffffff';
  for (const sd of seeds) { g.beginPath(); g.arc(sd.x, sd.y, 2.5, 0, Math.PI * 2); g.fill(); }
  slab(ts, spot, canvasTex(c), 'VORONOI');
}

/** Patrones de Chladni (placa vibrante con arena) */
function chladniPlate(ts, spot) {
  const S = 256, n = 3, m = 5;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#141a2e';
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = px / S, y = py / S;
      const v = Math.sin(n * Math.PI * x) * Math.sin(m * Math.PI * y)
        + Math.sin(m * Math.PI * x) * Math.sin(n * Math.PI * y);
      if (Math.abs(v) < 0.09) {
        const k = (py * S + px) * 4;
        img.data[k] = 235; img.data[k + 1] = 224; img.data[k + 2] = 188; img.data[k + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  const mesh = slab(ts, spot, canvasTex(c), 'CHLADNI', 18);
  // la placa vibra
  const base = mesh.position.clone();
  ts.animated.push(t => {
    mesh.position.copy(base).addScaledVector(spot.f.B, Math.sin(t * 22) * 0.06);
  });
}

/** Espiral de Ulam (los primos dibujan diagonales) */
function ulamSlab(ts, spot) {
  const CELLS = 101, S = 505, cell = S / CELLS;
  const N = CELLS * CELLS;
  const prime = new Uint8Array(N + 1).fill(1);
  prime[0] = prime[1] = 0;
  for (let i = 2; i * i <= N; i++) if (prime[i]) for (let j = i * i; j <= N; j += i) prime[j] = 0;

  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#10142a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#7dffea';
  let x = Math.floor(CELLS / 2), y = Math.floor(CELLS / 2);
  let dx = 1, dy = 0, stepLen = 1, steps = 0, turns = 0;
  for (let i = 1; i <= N; i++) {
    if (prime[i]) g.fillRect(x * cell + 1, y * cell + 1, cell - 1.5, cell - 1.5);
    x += dx; y += dy; steps++;
    if (steps === stepLen) {
      steps = 0;
      [dx, dy] = [dy, -dx]; // girar a la izquierda
      turns++;
      if (turns % 2 === 0) stepLen++;
    }
  }
  // el 1 en el centro, destacado
  g.fillStyle = '#ffd23f';
  g.fillRect(Math.floor(CELLS / 2) * cell, Math.floor(CELLS / 2) * cell, cell, cell);
  slab(ts, spot, canvasTex(c), 'ESPIRAL DE ULAM', 18);
}

/** Triángulo de Penrose (tribar imposible) */
function penroseSlab(ts, spot) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#101426';
  g.fillRect(0, 0, S, S);

  const cx = S / 2, cy = S / 2 + 26, R = 168, W = 52;
  const A = [0, 1, 2].map(k => {
    const a = -Math.PI / 2 + k * (2 * Math.PI / 3);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  const SHADES = ['#6e7bb8', '#2a3358', '#454f85'];
  // cada barra: trazo grueso que se extiende más allá de la esquina;
  // el orden de pintado + el repintado parcial crean el bucle imposible
  const bar = (k, frac = 1) => {
    const [x0, y0] = A[k], [x1, y1] = A[(k + 1) % 3];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const ex0 = x0 - ux * W * 0.62, ey0 = y0 - uy * W * 0.62;
    const ex1 = x0 + ux * (len * frac + (frac === 1 ? W * 0.62 : 0));
    const ey1 = y0 + uy * (len * frac + (frac === 1 ? W * 0.62 : 0));
    g.lineCap = 'butt';
    g.lineWidth = W + 7;
    g.strokeStyle = '#0a0d1c';
    g.beginPath(); g.moveTo(ex0, ey0); g.lineTo(ex1, ey1); g.stroke();
    g.lineWidth = W;
    g.strokeStyle = SHADES[k];
    g.beginPath(); g.moveTo(ex0, ey0); g.lineTo(ex1, ey1); g.stroke();
  };
  bar(0); bar(1); bar(2);
  bar(0, 0.30); // repintado parcial: la barra 0 pasa por encima de la 2
  slab(ts, spot, canvasTex(c), 'T. DE PENROSE', 18);
}

/** Triángulo (tetraedro) de Sierpinski en 3D */
function sierpinskiTetra(ts, spot) {
  const DEPTH = 3, SIZE = 14;
  const verts = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1),
  ];
  const centers = [];
  const rec = (cen, size, d) => {
    if (d === 0) { centers.push({ cen, size }); return; }
    for (const v of verts) rec(cen.clone().addScaledVector(v, size / 4), size / 2, d - 1);
  };
  rec(new THREE.Vector3(0, 0, 0), SIZE, DEPTH);

  const inst = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(1),
    matte(0xff5d8f, { emissive: 0x551528, emissiveIntensity: 0.4 }),
    centers.length);
  const m = new THREE.Matrix4();
  for (const [i, { cen, size }] of centers.entries()) {
    m.makeScale(size / 2.4, size / 2.4, size / 2.4).setPosition(cen);
    inst.setMatrixAt(i, m);
  }
  const holder = new THREE.Group();
  holder.add(inst);
  holder.position.copy(spot.pos);
  ts.group.add(holder);
  label(ts, spot, 'SIERPINSKI', -SIZE * 0.7 - 3);
  ts.animated.push((t, dt) => { holder.rotation.y += dt * 0.4; });
}

/** Fibración de Hopf: anillos anidados que nunca se tocan */
function hopfFibration(ts, spot) {
  const holder = new THREE.Group();
  const col = new THREE.Color();
  for (let i = 0; i < 11; i++) {
    const u = i / 11;
    col.setHSL(0.55 + u * 0.4, 0.8, 0.55);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5 + u * 6.5, 0.55, 8, 42),
      matte(col.clone(), { emissive: col.clone().multiplyScalar(0.25) }));
    // cada fibra inclinada un poco más: el haz de círculos enlazados
    ring.rotation.x = u * Math.PI * 0.9;
    ring.rotation.y = u * Math.PI;
    holder.add(ring);
  }
  holder.position.copy(spot.pos);
  ts.group.add(holder);
  label(ts, spot, 'FIBRACIÓN DE HOPF', -16);
  ts.animated.push((t, dt) => {
    holder.rotation.y += dt * 0.25;
    holder.rotation.x = Math.sin(t * 0.3) * 0.3;
  });
}

/** Botella de Klein sólida */
function kleinBottle(ts, spot) {
  const geo = new ParametricGeometry(klein, 36, 36);
  const mesh = new THREE.Mesh(geo, matte(0x46d5ff, {
    side: THREE.DoubleSide, emissive: 0x0a3340, emissiveIntensity: 0.4,
  }));
  mesh.scale.setScalar(1.5);
  mesh.position.copy(spot.pos);
  ts.group.add(mesh);
  label(ts, spot, 'BOTELLA DE KLEIN', -17);
  ts.animated.push((t, dt) => { mesh.rotation.y += dt * 0.5; mesh.rotation.x = Math.PI + Math.sin(t * 0.4) * 0.2; });
}

/** Copo de nieve de Koch extruido con grosor */
function kochSnowflake(ts, spot) {
  // contorno por subdivisión iterativa
  let pts = [0, 1, 2].map(k => {
    const a = -Math.PI / 2 + k * (2 * Math.PI / 3);
    return new THREE.Vector2(Math.cos(a) * 9, Math.sin(a) * 9);
  });
  for (let it = 0; it < 4; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = b.clone().sub(a);
      const p1 = a.clone().addScaledVector(d, 1 / 3);
      const p2 = a.clone().addScaledVector(d, 2 / 3);
      // pico hacia fuera (rotar -60°)
      const peak = p1.clone().add(d.clone().multiplyScalar(1 / 3).rotateAround(new THREE.Vector2(), -Math.PI / 3));
      out.push(a, p1, peak, p2);
    }
    pts = out;
  }
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, matte(0xbfe9ff, { emissive: 0x24405a, emissiveIntensity: 0.5, flatShading: false }));
  mesh.position.copy(spot.pos);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    spot.f.T.clone(), spot.f.N, spot.f.B.clone()));
  ts.group.add(mesh);
  label(ts, spot, 'COPO DE KOCH', -14);
  ts.animated.push((t, dt) => { mesh.rotateZ(dt * 0.3); });
}

/** Atractor de Lorenz como tubo sólido + cometas */
function lorenzTube(ts, spot) {
  const N = 4000;
  let x = 0.4, y = 0.2, z = 22;
  const SC = 1.35;
  const raw = [];
  for (let i = 0; i < N; i++) {
    const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
    x += dx * 0.005; y += dy * 0.005; z += dz * 0.005;
    if (i % 5 === 0) raw.push(new THREE.Vector3(x * SC, (z - 25) * SC, y * SC));
  }
  const curve = new THREE.CatmullRomCurve3(raw);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 1400, 0.34, 6),
    matte(0x46d5ff, { emissive: 0x0e4458, emissiveIntensity: 0.6, flatShading: false }));
  const holder = new THREE.Group();
  holder.add(tube);
  holder.position.copy(spot.pos);
  ts.group.add(holder);
  label(ts, spot, 'ATRACTOR DE LORENZ', -28);

  // cometas sólidos recorriendo el atractor
  const comets = [];
  for (let k = 0; k < 3; k++) {
    const comet = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8),
      matte(0xffd23f, { emissive: 0xa07010, emissiveIntensity: 0.8 }));
    holder.add(comet);
    comets.push({ comet, ph: k / 3 });
  }
  ts.animated.push((t, dt) => {
    holder.rotation.y += dt * 0.12;
    for (const { comet, ph } of comets) {
      comet.position.copy(curve.getPointAt((t * 0.03 + ph) % 1));
    }
  });
}

/** Diagrama de Feynman: e⁻ e⁻ intercambiando un fotón */
function feynmanDiagram(ts, spot) {
  const holder = new THREE.Group();
  const fermion = matte(0x7dffea, { emissive: 0x16544c, emissiveIntensity: 0.5, flatShading: false });
  const photonM = matte(0xffd23f, { emissive: 0x6b5410, emissiveIntensity: 0.6, flatShading: false });

  const tubeBetween = (a, b, mat, r = 0.4) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8), mat);
    holder.add(m);
    return m;
  };
  const V1 = new THREE.Vector3(-5, 0, 0), V2 = new THREE.Vector3(5, 0, 0);
  // patas de electrón
  tubeBetween(new THREE.Vector3(-13, -10, 0), V1, fermion);
  tubeBetween(V1, new THREE.Vector3(-13, 10, 0), fermion);
  tubeBetween(new THREE.Vector3(13, -10, 0), V2, fermion);
  tubeBetween(V2, new THREE.Vector3(13, 10, 0), fermion);
  // fotón ondulado γ
  const wavy = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    wavy.push(new THREE.Vector3(-5 + u * 10, Math.sin(u * Math.PI * 6) * 1.1, 0));
  }
  holder.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wavy), 120, 0.32, 6), photonM));
  // flechas de las líneas de fermión
  const arrowGeo = new THREE.ConeGeometry(0.9, 2.0, 8);
  for (const [pos, dir] of [
    [new THREE.Vector3(-9, -5, 0), new THREE.Vector3(0.62, 0.78, 0)],
    [new THREE.Vector3(-9, 5, 0), new THREE.Vector3(-0.62, 0.78, 0)],
    [new THREE.Vector3(9, -5, 0), new THREE.Vector3(-0.62, 0.78, 0)],
    [new THREE.Vector3(9, 5, 0), new THREE.Vector3(0.62, 0.78, 0)],
  ]) {
    const ar = new THREE.Mesh(arrowGeo, fermion);
    ar.position.copy(pos);
    ar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    holder.add(ar);
  }
  // vértices
  for (const v of [V1, V2]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), matte(0xffffff));
    dot.position.copy(v);
    holder.add(dot);
  }
  holder.position.copy(spot.pos);
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    spot.f.T.clone().multiplyScalar(-spot.side), spot.f.N, spot.f.B.clone().multiplyScalar(-spot.side)));
  ts.group.add(holder);
  label(ts, spot, 'DIAGRAMA DE FEYNMAN', -15);
  ts.animated.push(t => { holder.rotation.z = Math.sin(t * 0.4) * 0.06; });
}

/** Esfera de Riemann: proyección estereográfica al plano */
function riemannSphere(ts, spot) {
  const holder = new THREE.Group();
  // rejilla de meridianos/paralelos pintada en canvas
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#1c2f6e';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#9fd0ff';
  g.lineWidth = 3;
  for (let i = 0; i <= 12; i++) {
    g.beginPath(); g.moveTo((i / 12) * S, 0); g.lineTo((i / 12) * S, S); g.stroke();
  }
  for (let i = 0; i <= 6; i++) {
    g.beginPath(); g.moveTo(0, (i / 6) * S); g.lineTo(S, (i / 6) * S); g.stroke();
  }
  const R = 6, H = 9; // centro de la esfera a altura H sobre el plano
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18),
    new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.9, metalness: 0 }));
  sphere.position.y = H;
  holder.add(sphere);

  // plano complejo (disco grueso)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.8, 36),
    matte(0x24305c, { emissive: 0x10183a, emissiveIntensity: 0.5 }));
  disc.position.y = -0.4;
  holder.add(disc);

  // rayos de proyección desde el polo norte
  const N = new THREE.Vector3(0, H + R, 0);
  const rayMat = matte(0xffd23f, { emissive: 0x806010, emissiveIntensity: 0.7, flatShading: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lat = -0.5 + (i % 3) * 0.45;
    const P = new THREE.Vector3(
      R * Math.cos(lat) * Math.cos(a), H + R * Math.sin(lat), R * Math.cos(lat) * Math.sin(a));
    const t = N.y / (N.y - P.y); // intersección con y=0
    const hit = N.clone().lerp(P, t);
    if (hit.length() > 15.5) hit.setLength(15.5);
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(N.clone(), hit), 1, 0.16, 6), rayMat);
    holder.add(m);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), rayMat);
    dot.position.copy(hit).setY(0.45);
    holder.add(dot);
  }
  holder.position.copy(spot.pos);
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spot.f.N);
  ts.group.add(holder);
  label(ts, spot, 'ESFERA DE RIEMANN', -5);
  ts.animated.push((t, dt) => { sphere.rotation.y += dt * 0.3; });
}

// ════ CRIATURAS LOW-POLY ═════════════════════════════════════════════

const DRAGON_COLS = [0xef4444, 0x4ade80];
let _dragonN = 0;

/** dragón de polígonos volando en círculos */
function dragon(ts, spot) {
  const color = DRAGON_COLS[_dragonN++ % DRAGON_COLS.length];
  const bodyMat = matte(color);
  const wingMat = matte(0xffd23f);

  // cabeza: grupo con morro, cuernos y ojos
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), bodyMat);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 6), bodyMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 2.0;
  head.add(skull, snout);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 5), wingMat);
    horn.position.set(sx * 0.8, 1.3, -0.6);
    horn.rotation.z = -sx * 0.45;
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
      matte(0xffffff, { emissive: 0xffffaa, emissiveIntensity: 0.8 }));
    eye.position.set(sx * 0.75, 0.45, 1.1);
    head.add(eye);
  }
  ts.group.add(head);

  // cuerpo: 10 segmentos octaedro decrecientes; el 2º lleva las alas
  const SEGS = 10;
  const segs = [];
  for (let k = 0; k < SEGS; k++) {
    const sc = 1.5 * (1 - k / SEGS * 0.75);
    const seg = new THREE.Group();
    seg.add(new THREE.Mesh(new THREE.OctahedronGeometry(sc, 0), bodyMat));
    if (k === 1) {
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.5, 3), wingMat);
        wing.scale.z = 0.16;
        wing.rotation.z = sx * Math.PI / 2;
        wing.position.x = sx * 3.2;
        wing.userData.sx = sx;
        seg.add(wing);
        seg.userData['wing' + (sx > 0 ? 'R' : 'L')] = wing;
      }
    }
    if (k === SEGS - 1) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 4), wingMat);
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -1.2;
      seg.add(tail);
    }
    ts.group.add(seg);
    segs.push(seg);
  }

  // vuelo: círculo alrededor del anclaje con ondulación vertical
  const anchor = spot.pos.clone();
  const RAD = 26, W = 0.45, PH = Math.random() * 7;
  const pathAt = (tt, out) => out.set(
    anchor.x + RAD * Math.cos(tt * W + PH),
    anchor.y + 5 * Math.sin(tt * W * 2.3 + PH),
    anchor.z + RAD * Math.sin(tt * W + PH));
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  ts.animated.push(t => {
    pathAt(t, p0); pathAt(t + 0.12, p1);
    head.position.copy(p0);
    mtx.lookAt(p1, p0, new THREE.Vector3(0, 1, 0));
    head.quaternion.setFromRotationMatrix(mtx);
    head.rotateY(Math.PI); // el morro mira hacia delante
    for (const [k, seg] of segs.entries()) {
      pathAt(t - (k + 1) * 0.22, p0);
      pathAt(t - (k + 1) * 0.22 + 0.12, p1);
      seg.position.copy(p0);
      mtx.lookAt(p1, p0, new THREE.Vector3(0, 1, 0));
      seg.quaternion.setFromRotationMatrix(mtx);
      const wr = seg.userData.wingR, wl = seg.userData.wingL;
      if (wr) {
        const flap = Math.sin(t * 7 + PH) * 0.7;
        wr.rotation.z = Math.PI / 2 + flap;
        wl.rotation.z = -Math.PI / 2 - flap;
      }
    }
  });
}

/** robot low-poly saludando al público */
function robot(ts, spot) {
  const f = spot.f;
  const holder = new THREE.Group();
  const bodyMat = matte(0x8b93b8);
  const accMat = matte(0xffd23f);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(4.4, 5.2, 2.8), bodyMat);
  torso.position.y = 6.2;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.5), accMat);
  chest.position.set(0, 6.8, 1.5);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 2.4), accMat);
  hips.position.y = 3.2;
  holder.add(torso, chest, hips);

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.2, 1.6), bodyMat);
    leg.position.set(sx * 1.1, 1.6, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.6), accMat);
    foot.position.set(sx * 1.1, 0.4, 0.4);
    holder.add(leg, foot);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.4), bodyMat);
  head.position.y = 10.1;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.2),
      matte(0x46d5ff, { emissive: 0x2090c0, emissiveIntensity: 1.6 }));
    eye.position.set(sx * 0.6, 0.2, 1.25);
    head.add(eye);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), accMat);
  antenna.position.set(0, 1.7, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
    matte(0xef4444, { emissive: 0xc01010, emissiveIntensity: 1.2 }));
  bulb.position.y = 0.8;
  antenna.add(bulb);
  head.add(antenna);
  holder.add(head);

  // brazos con hombro articulado (uno saluda)
  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 2.8, 8.0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.6, 1.3), bodyMat);
    arm.position.y = -1.6;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), accMat);
    hand.position.y = -3.5;
    shoulder.add(arm, hand);
    holder.add(shoulder);
    arms.push(shoulder);
  }

  holder.position.copy(spot.pos);
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.N);
  ts.group.add(holder);

  const PH = Math.random() * 7;
  ts.animated.push(t => {
    arms[1].rotation.z = Math.PI * 0.8 + Math.sin(t * 4 + PH) * 0.45; // saluda
    arms[0].rotation.x = Math.sin(t * 1.2 + PH) * 0.2;
    head.rotation.y = Math.sin(t * 0.7 + PH) * 0.5;
    holder.position.copy(spot.pos).addScaledVector(f.N, Math.abs(Math.sin(t * 2.2 + PH)) * 0.4);
  });
}

const DINO_COLS = [0x4ade80, 0xf97316];
let _dinoN = 0;

/** dinosaurio low-poly (cuello largo) paciendo junto a la pista */
function dino(ts, spot) {
  const f = spot.f;
  const color = DINO_COLS[_dinoN++ % DINO_COLS.length];
  const mat = matte(color);
  const belly = matte(0xf6f0d8);
  const holder = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), mat);
  body.scale.set(1, 0.82, 1.5);
  body.position.y = 5.4;
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(2.9, 10, 8), belly);
  tummy.scale.set(0.85, 0.6, 1.25);
  tummy.position.y = 4.6;
  holder.add(body, tummy);

  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 4.2, 8), mat);
    leg.position.set(sx * 2.0, 2.1, sz * 2.9);
    holder.add(leg);
  }

  // cuello articulado de 4 tramos + cabeza
  const neck = new THREE.Group();
  neck.position.set(0, 7.0, 4.2);
  let parent = neck;
  const neckSegs = [];
  for (let k = 0; k < 4; k++) {
    const segHold = new THREE.Group();
    segHold.position.y = k === 0 ? 0 : 2.0;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - k * 0.12, 1.0 - k * 0.12, 2.2, 8), mat);
    seg.position.y = 1.0;
    segHold.add(seg);
    parent.add(segHold);
    parent = segHold;
    neckSegs.push(segHold);
  }
  const headD = new THREE.Group();
  headD.position.y = 2.4;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 2.4), mat);
  skull.position.z = 0.5;
  headD.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6),
      matte(0x14141f));
    eye.position.set(sx * 0.55, 0.45, 1.0);
    headD.add(eye);
  }
  parent.add(headD);
  holder.add(neck);

  // cola: cadena de conos
  const tailSegs = [];
  for (let k = 0; k < 5; k++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(1.2 - k * 0.2, 2.4, 7), mat);
    t.rotation.x = -Math.PI / 2 - 0.18 * k;
    holder.add(t);
    tailSegs.push(t);
  }

  holder.position.copy(spot.pos);
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.N);
  holder.rotation.y = Math.random() * Math.PI * 2;
  ts.group.add(holder);

  const PH = Math.random() * 7;
  ts.animated.push(t => {
    // el cuello barre de lado a lado y baja a pastar
    const sway = Math.sin(t * 0.7 + PH) * 0.22;
    const graze = Math.max(0, Math.sin(t * 0.3 + PH)) * 0.30;
    for (const [k, seg] of neckSegs.entries()) {
      seg.rotation.z = sway * (0.4 + k * 0.2);
      seg.rotation.x = 0.16 - graze * (0.3 + k * 0.12);
    }
    for (const [k, seg] of tailSegs.entries()) {
      const wag = Math.sin(t * 1.6 + PH - k * 0.5) * (0.5 + k * 0.35);
      seg.position.set(wag * 0.8, 5.2 - k * 0.5, -5.2 - k * 1.9);
      seg.rotation.y = wag * 0.18;
    }
    body.position.y = 5.4 + Math.sin(t * 1.1 + PH) * 0.12;
  });
}

/** banco de formas geométricas brillantes en órbita */
function shapeShoal(ts, spot) {
  const GEOS = [
    new THREE.TetrahedronGeometry(1.6), new THREE.BoxGeometry(2.2, 2.2, 2.2),
    new THREE.OctahedronGeometry(1.7), new THREE.IcosahedronGeometry(1.5),
    new THREE.TorusGeometry(1.4, 0.5, 6, 12), new THREE.DodecahedronGeometry(1.5),
  ];
  const COLS = [0xef4444, 0x3b82f6, 0xeab308, 0x4ade80, 0xf97316, 0x8b5cf6];
  const shapes = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(GEOS[i % GEOS.length], matte(COLS[i % COLS.length]));
    ts.group.add(m);
    shapes.push({
      m, r: 6 + (i % 4) * 3.5, sp: 0.4 + (i % 3) * 0.25,
      ph: (i / 9) * Math.PI * 2, tilt: (i % 5) * 0.6, spin: 0.6 + (i % 4) * 0.4,
    });
  }
  ts.animated.push(t => {
    for (const sh of shapes) {
      const a = t * sh.sp + sh.ph;
      sh.m.position.copy(spot.pos)
        .addScaledVector(spot.f.B, Math.cos(a) * sh.r)
        .addScaledVector(spot.f.N, Math.sin(a + sh.tilt) * sh.r * 0.5)
        .addScaledVector(spot.f.T, Math.sin(a) * sh.r * 0.7);
      sh.m.rotation.x = t * sh.spin;
      sh.m.rotation.y = t * sh.spin * 0.7;
    }
  });
}
