import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** genera puntos de una curva paramétrica cerrada */
function sample(fn, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(fn((i / n) * Math.PI * 2));
  return pts;
}

export const CIRCUITS = [
  // ── 1 ── SPHERE SPEEDWAY ──────────────────────────────────────────────
  {
    id: 'sphere',
    name: 'Sphere Speedway',
    concept: 'Curvatura positiva · geodésicas cerradas',
    quote: 'En una esfera, ir “recto” te trae de vuelta: toda geodésica es un círculo máximo. Sales de un polo, cruzas el otro y regresas.',
    minimap: 'sphere',
    laps: 3,
    surface: { type: 'sphere', R: 62 },
    bandHalf: 11,
    theme: {
      skyTop: 0x12275e, skyBottom: 0x5da8e8, fog: 0x3a6fc0, fogDensity: 0.0024,
      road: 0xdde6f5, roadLine: 0x2f7fe0, edge: 0x46d5ff, edge2: 0xffd23f,
      band: 0x9fd4f5, decor: 'sphere', light: 0xfff4e0, ambient: 0x90b4e8,
    },
    formulas: ['x² + y² + z² = R²', 'χ(S²) = 2', 'K = 1/R² > 0', 'A = 4πR²'],
    itemBoxes: [0.10, 0.11, 0.12, 0.35, 0.36, 0.37, 0.60, 0.61, 0.62, 0.85, 0.86, 0.87]
      .map((s, i) => ({ s, q: [-5, 0, 5][i % 3] })),
    boostPads: [{ s: 0.27, q: 0 }, { s: 0.52, q: 0 }, { s: 0.77, q: -3 }],
    rings: [0.22, 0.47, 0.72, 0.97],
    obstacles: [
      { type: 'cone', s: 0.18, q: -4 }, { type: 'cone', s: 0.19, q: 3 },
      { type: 'bumper', s: 0.42, q: 0 },
      { type: 'cone', s: 0.66, q: 4 }, { type: 'cone', s: 0.67, q: -3 },
      { type: 'bumper', s: 0.90, q: -4 },
    ],
    toasts: {
      wrap: 'Círculo máximo completado: polo norte → polo sur → polo norte.',
      half: 'Polo sur cruzado: vas exactamente por las antípodas de la salida.',
    },
    challenge: 'Una geodésica de la esfera siempre se cierra. Mantente en la banda y completa el círculo máximo.',
  },

  // ── 2 ── MÖBIUS MOTORWAY ──────────────────────────────────────────────
  {
    id: 'mobius',
    name: 'Möbius Motorway',
    concept: 'No orientabilidad',
    quote: 'Si das una vuelta completa, vuelves al inicio con la orientación invertida. Esta superficie no tiene dos caras separadas.',
    minimap: 'mobius',
    laps: 3,
    twistTurns: 0.5,
    halfWidth: 10,
    samples: 1400,
    points: sample(a => {
      const r = 95 + 18 * Math.sin(2 * a + 0.6);
      return V(r * Math.cos(a), 14 * Math.sin(2 * a) + 6 * Math.sin(3 * a), r * Math.sin(a));
    }, 64),
    theme: {
      skyTop: 0x0a1e4d, skyBottom: 0x2b6fd4, fog: 0x1c4a9e, fogDensity: 0.0030,
      road: 0xf2f3f8, roadLine: 0x3b6fe0, edge: 0x46d5ff, edge2: 0xff5d8f,
      decor: 'mobius', light: 0xffffff, ambient: 0x8fb5ff,
    },
    formulas: ['χ = 0', '1 cara · 1 borde', '½ giro: no orientable', '(u, v) ~ (u+2π, −v)'],
    itemBoxes: [0.12, 0.13, 0.14, 0.37, 0.38, 0.39, 0.62, 0.63, 0.64, 0.87, 0.88, 0.89]
      .map((s, i) => ({ s, q: [-5, 0, 5][i % 3] })),
    boostPads: [{ s: 0.30, q: 0 }, { s: 0.55, q: -4 }, { s: 0.80, q: 4 }],
    rings: [0.2, 0.45, 0.7],
    tunnels: [{ s: 0.58, len: 40 }],
    gaps: [{ s0: 0.40, s1: 0.50, side: 1 }, { s0: 0.67, s1: 0.75, side: -1 }],
    obstacles: [
      { type: 'spinner', s: 0.25, q: 0 },
      { type: 'cone', s: 0.48, q: -5 }, { type: 'cone', s: 0.49, q: 4 },
      { type: 'spinner', s: 0.74, q: 0 },
    ],
    toasts: { wrap: 'Tu orientación se ha invertido: misma cinta, “otra cara”.' },
    challenge: 'Cruza la meta con la orientación invertida.',
  },

  // ── 3 ── TORO TERMINAL ────────────────────────────────────────────────
  {
    id: 'torus',
    name: 'Toro Terminal',
    concept: 'Dos ciclos: agujero y tubo',
    quote: 'Un toro tiene dos vueltas básicas: alrededor del agujero (ciclo A) y alrededor del tubo (ciclo B). Aquí puedes conducir las dos.',
    minimap: 'torus',
    laps: 3,
    surface: { type: 'torus', R: 84, r: 26 },
    bandHalf: 9,
    theme: {
      skyTop: 0x1a0b33, skyBottom: 0x7a3fc1, fog: 0x47207a, fogDensity: 0.0028,
      road: 0xe8e0f5, roadLine: 0xb03fe0, edge: 0xffd23f, edge2: 0x46d5ff,
      band: 0xe2c8ff, decor: 'torus', light: 0xfff2e0, ambient: 0xb89aff,
    },
    formulas: ['(√(x²+z²) − R)² + y² = r²', 'χ(T²) = 0', 'π₁(T²) = ℤ × ℤ', 'A = 4π²Rr'],
    // q en metros alrededor del tubo (período 2π·26 ≈ 163)
    itemBoxes: [
      { s: 0.08, q: -5 }, { s: 0.09, q: 0 }, { s: 0.10, q: 5 },
      { s: 0.33, q: -5 }, { s: 0.34, q: 0 }, { s: 0.35, q: 5 },
      { s: 0.58, q: 0 }, { s: 0.59, q: 40 }, { s: 0.60, q: -40 },
      { s: 0.83, q: 0 }, { s: 0.84, q: 81 }, { s: 0.85, q: 81 },
    ],
    // el interior del toro (q≈81m = media vuelta de tubo) es la ruta corta: turbos dentro
    boostPads: [
      { s: 0.2, q: 0 }, { s: 0.45, q: 81 }, { s: 0.55, q: 81 },
      { s: 0.7, q: 0 }, { s: 0.95, q: -50 },
    ],
    rings: [0.15, 0.4, 0.65, 0.9],
    obstacles: [
      { type: 'spinner', s: 0.3, q: 0 },
      { type: 'bumper', s: 0.5, q: 81 },
      { type: 'cone', s: 0.62, q: -4 }, { type: 'cone', s: 0.63, q: 4 },
      { type: 'spinner', s: 0.85, q: 0 },
    ],
    toasts: {
      wrap: 'Ciclo A completado: una vuelta alrededor del agujero.',
      cycleB: '¡Ciclo B completado! Has rodeado el tubo del toro.',
    },
    challenge: 'Rodea también el tubo (ciclo B): por dentro el camino es más corto… y hay turbos.',
  },

  // ── 4 ── DOUBLE DONUT DRIFT ───────────────────────────────────────────
  {
    id: 'double',
    name: 'Double Donut Drift',
    concept: 'Género 2 · caminos no equivalentes',
    quote: 'En una superficie con varios agujeros, rodear un agujero u otro produce caminos topológicamente distintos.',
    minimap: 'double',
    laps: 3,
    twistTurns: 0,
    halfWidth: 9.5,
    samples: 1600,
    points: sample(a => V(
      150 * Math.sin(a),
      16 * Math.cos(a) + 8,
      105 * Math.sin(a) * Math.cos(a),
    ), 96),
    theme: {
      skyTop: 0x3d1102, skyBottom: 0xff9a3c, fog: 0xc05a18, fogDensity: 0.0026,
      road: 0xfff3e0, roadLine: 0xff5d2e, edge: 0xff5d8f, edge2: 0x4ade80,
      decor: 'double', light: 0xffe8c8, ambient: 0xffb070,
    },
    formulas: ['g = 2', 'χ = 2 − 2g = −2', 'π₁ no abeliano', 'z² = x(x−1)(x−2)(x−3)(x−4)'],
    itemBoxes: [0.10, 0.11, 0.12, 0.35, 0.36, 0.37, 0.60, 0.61, 0.62, 0.85, 0.86, 0.87]
      .map((s, i) => ({ s, q: [-4.5, 0, 4.5][i % 3] })),
    boostPads: [{ s: 0.18, q: 0 }, { s: 0.43, q: 0 }, { s: 0.68, q: 0 }, { s: 0.93, q: 0 }],
    rings: [0.12, 0.38, 0.62, 0.88],
    tunnels: [{ s: 0.31, len: 36 }, { s: 0.81, len: 36 }],
    gaps: [{ s0: 0.205, s1: 0.27, side: 1 }, { s0: 0.70, s1: 0.78, side: -1 }],
    obstacles: [
      { type: 'bumper', s: 0.24, q: 0 },
      { type: 'cone', s: 0.5, q: -4 }, { type: 'cone', s: 0.505, q: 4 },
      { type: 'bumper', s: 0.74, q: 0 },
      { type: 'spinner', s: 0.95, q: 0 },
    ],
    toasts: {
      half: 'Has rodeado el Agujero 1. Ahora toca el Agujero 2: son caminos distintos.',
      wrap: 'Vuelta completa: has rodeado los dos agujeros.',
    },
    challenge: 'El cruce central es una intersección falsa: una carretera pasa sobre la otra.',
  },

  // ── 5 ── HYPERBOLIC HAVOC ─────────────────────────────────────────────
  {
    id: 'hyper',
    name: 'Hyperbolic Havoc',
    concept: 'Curvatura negativa · geodésicas',
    quote: 'En geometría hiperbólica las geodésicas pueden parecer curvas: el camino más corto no siempre parece una línea recta.',
    minimap: 'hyper',
    laps: 3,
    twistTurns: 0,
    halfWidth: 8.5,
    samples: 1600,
    points: sample(a => {
      const r = 88 + 42 * Math.sin(3 * a);
      return V(r * Math.cos(a), 10 * Math.sin(6 * a) + 4, r * Math.sin(a));
    }, 96),
    theme: {
      skyTop: 0x021515, skyBottom: 0x0b5f5a, fog: 0x073d3c, fogDensity: 0.0036,
      road: 0xd9fff4, roadLine: 0x0fae9b, edge: 0x4ade80, edge2: 0xffd23f,
      decor: 'hyper', light: 0xd8fff0, ambient: 0x5fd0b8,
    },
    formulas: ['K = −1', '𝔻 = { z : |z| < 1 }', 'ds = 2|dz| / (1−|z|²)', 'Σ∠△ < π'],
    itemBoxes: [0.07, 0.08, 0.09, 0.32, 0.33, 0.34, 0.57, 0.58, 0.59, 0.82, 0.83, 0.84]
      .map((s, i) => ({ s, q: [-4, 0, 4][i % 3] })),
    boostPads: [{ s: 0.16, q: 0 }, { s: 0.5, q: 0 }, { s: 0.83, q: 0 }],
    rings: [0.1, 0.43, 0.76],
    tunnels: [{ s: 0.6, len: 44 }],
    gaps: [{ s0: 0.26, s1: 0.33, side: 1 }, { s0: 0.69, s1: 0.76, side: -1 }],
    obstacles: [
      { type: 'spinner', s: 0.21, q: 0 },
      { type: 'cone', s: 0.37, q: -3 }, { type: 'cone', s: 0.38, q: 3 },
      { type: 'bumper', s: 0.55, q: 0 },
      { type: 'cone', s: 0.7, q: 0 },
      { type: 'spinner', s: 0.9, q: 0 },
    ],
    toasts: { wrap: 'Las rutas que parecían paralelas se han separado: curvatura negativa.' },
    challenge: 'Usa Geodesic Assist: la ruta luminosa es más corta de lo que parece.',
  },
];
