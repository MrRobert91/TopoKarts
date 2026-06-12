import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** genera puntos de una curva paramétrica cerrada */
function sample(fn, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(fn((i / n) * Math.PI * 2));
  return pts;
}

export const CIRCUITS = [
  // ── 1 ── MÖBIUS MOTORWAY ──────────────────────────────────────────────
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
      skyTop: 0x0a1e4d, skyBottom: 0x2b6fd4, fog: 0x1c4a9e, fogDensity: 0.0035,
      road: 0xf2f3f8, roadLine: 0x3b6fe0, edge: 0x46d5ff, edge2: 0xff5d8f,
      decor: 'mobius', light: 0xffffff, ambient: 0x8fb5ff,
    },
    itemBoxes: [0.12, 0.13, 0.14, 0.37, 0.38, 0.39, 0.62, 0.63, 0.64, 0.87, 0.88, 0.89]
      .map((s, i) => ({ s, q: [-5, 0, 5][i % 3] })),
    boostPads: [{ s: 0.30, q: 0 }, { s: 0.55, q: -4 }, { s: 0.80, q: 4 }],
    toasts: { wrap: 'Tu orientación se ha invertido: misma cinta, “otra cara”.' },
    challenge: 'Cruza la meta con la orientación invertida.',
  },

  // ── 2 ── TORO TERMINAL ────────────────────────────────────────────────
  {
    id: 'torus',
    name: 'Toro Terminal',
    concept: 'Bordes identificados · ciclos del toro',
    quote: 'Un toro puede representarse como un cuadrado cuyos lados opuestos están pegados: salir por un borde te devuelve por el otro.',
    minimap: 'torus',
    laps: 3,
    twistTurns: 0,
    halfWidth: 9,
    samples: 1600,
    // recorre 1 vez el agujero central (ciclo A) y 2 veces el tubo (ciclo B)
    points: sample(a => {
      const R = 95, r = 34;
      const phi = 2 * a + 0.9 * Math.sin(a);
      return V(
        (R + r * Math.cos(phi)) * Math.cos(a),
        r * Math.sin(phi),
        (R + r * Math.cos(phi)) * Math.sin(a),
      );
    }, 96),
    theme: {
      skyTop: 0x1a0b33, skyBottom: 0x7a3fc1, fog: 0x47207a, fogDensity: 0.0032,
      road: 0xe8e0f5, roadLine: 0xb03fe0, edge: 0xffd23f, edge2: 0x46d5ff,
      decor: 'torus', light: 0xfff2e0, ambient: 0xb89aff,
    },
    itemBoxes: [0.08, 0.09, 0.10, 0.33, 0.34, 0.35, 0.58, 0.59, 0.60, 0.83, 0.84, 0.85]
      .map((s, i) => ({ s, q: [-4.5, 0, 4.5][i % 3] })),
    boostPads: [{ s: 0.2, q: 0 }, { s: 0.45, q: 3 }, { s: 0.7, q: -3 }, { s: 0.95, q: 0 }],
    toasts: { wrap: 'Ciclo completado: 1 vuelta al agujero, 2 vueltas al tubo.' },
    challenge: 'Mira el minimapa: al salir por un borde del cuadrado, reapareces por el opuesto.',
  },

  // ── 3 ── DOUBLE DONUT DRIFT ───────────────────────────────────────────
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
    // lemniscata 3D: dos lóbulos, con paso elevado en el cruce central
    points: sample(a => V(
      150 * Math.sin(a),
      16 * Math.cos(a) + 8,
      105 * Math.sin(a) * Math.cos(a),
    ), 96),
    theme: {
      skyTop: 0x3d1102, skyBottom: 0xff9a3c, fog: 0xc05a18, fogDensity: 0.0030,
      road: 0xfff3e0, roadLine: 0xff5d2e, edge: 0xff5d8f, edge2: 0x4ade80,
      decor: 'double', light: 0xffe8c8, ambient: 0xffb070,
    },
    itemBoxes: [0.10, 0.11, 0.12, 0.35, 0.36, 0.37, 0.60, 0.61, 0.62, 0.85, 0.86, 0.87]
      .map((s, i) => ({ s, q: [-4.5, 0, 4.5][i % 3] })),
    boostPads: [{ s: 0.18, q: 0 }, { s: 0.43, q: 0 }, { s: 0.68, q: 0 }, { s: 0.93, q: 0 }],
    toasts: {
      half: 'Has rodeado el Agujero 1. Ahora toca el Agujero 2: son caminos distintos.',
      wrap: 'Vuelta completa: has rodeado los dos agujeros.',
    },
    challenge: 'El cruce central es una intersección falsa: una carretera pasa sobre la otra.',
  },

  // ── 4 ── HYPERBOLIC HAVOC ─────────────────────────────────────────────
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
    // roseta que se expande hacia el borde del disco, con ondulación de silla
    points: sample(a => {
      const r = 88 + 42 * Math.sin(3 * a);
      return V(r * Math.cos(a), 10 * Math.sin(6 * a) + 4, r * Math.sin(a));
    }, 96),
    theme: {
      skyTop: 0x021515, skyBottom: 0x0b5f5a, fog: 0x073d3c, fogDensity: 0.0040,
      road: 0xd9fff4, roadLine: 0x0fae9b, edge: 0x4ade80, edge2: 0xffd23f,
      decor: 'hyper', light: 0xd8fff0, ambient: 0x5fd0b8,
    },
    itemBoxes: [0.07, 0.08, 0.09, 0.32, 0.33, 0.34, 0.57, 0.58, 0.59, 0.82, 0.83, 0.84]
      .map((s, i) => ({ s, q: [-4, 0, 4][i % 3] })),
    boostPads: [{ s: 0.16, q: 0 }, { s: 0.5, q: 0 }, { s: 0.83, q: 0 }],
    toasts: { wrap: 'Las rutas que parecían paralelas se han separado: curvatura negativa.' },
    challenge: 'Usa Geodesic Assist: la ruta luminosa es más corta de lo que parece.',
  },

  // ── 5 ── POINCARÉ PALACE ──────────────────────────────────────────────
  {
    id: 'poincare',
    name: 'Poincaré Palace',
    concept: 'Espacio cerrado sin borde · caras identificadas',
    quote: 'Este espacio no tiene borde. Al atravesar una cara brillante, vuelves al mismo universo desde otra dirección.',
    minimap: 'poincare',
    laps: 3,
    twistTurns: 0,
    halfWidth: 9,
    samples: 1800,
    // trébol 3D dentro del dodecaedro: la pista se retuerce por el interior
    points: sample(a => V(
      34 * (Math.sin(a) + 2 * Math.sin(2 * a)),
      30 * (Math.cos(a) - 2 * Math.cos(2 * a)) * 0.55,
      -40 * Math.sin(3 * a),
    ), 120),
    theme: {
      skyTop: 0x05030f, skyBottom: 0x1b1140, fog: 0x0d0825, fogDensity: 0.0042,
      road: 0xeae6ff, roadLine: 0x7c6bff, edge: 0xb09cff, edge2: 0xffd23f,
      decor: 'poincare', light: 0xd8ccff, ambient: 0x6f5fd0,
    },
    itemBoxes: [0.06, 0.07, 0.08, 0.31, 0.32, 0.33, 0.56, 0.57, 0.58, 0.81, 0.82, 0.83]
      .map((s, i) => ({ s, q: [-4.5, 0, 4.5][i % 3] })),
    boostPads: [{ s: 0.14, q: 0 }, { s: 0.39, q: 0 }, { s: 0.64, q: 0 }, { s: 0.89, q: 0 }],
    // puertas-portal: posiciones s (fracción) donde la pista cruza una "cara"
    portals: [0.165, 0.5, 0.835],
    toasts: {
      portal: 'Has atravesado una cara conectada.',
      wrap: 'Universo finito, sin borde: nunca has salido del palacio.',
    },
    challenge: 'Cruza las tres caras identificadas en una misma vuelta.',
  },
];
