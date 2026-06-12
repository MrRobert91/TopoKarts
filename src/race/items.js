import * as THREE from 'three';

/**
 * Objetos recogibles. Cada uno enseña un concepto topológico.
 * apply(race, kart) ejecuta el efecto.
 */
export const ITEMS = {
  geodesic: {
    id: 'geodesic', icon: '〰️', name: 'Geodesic Assist',
    lesson: 'Geodésicas: caminos “rectos” dentro de una superficie curva.',
    apply(race, kart) {
      kart.assistT = 6;
      race.showGeodesic(kart, 6);
      race.audio?.sfx('geodesic');
      race.toast(kart, 'Geodesic Assist: sigue la línea luminosa.');
    },
  },
  unfolder: {
    id: 'unfolder', icon: '🗺️', name: 'Surface Unfolder',
    lesson: 'Despliegue: bordes y caras identificadas de un espacio cociente.',
    apply(race, kart) {
      kart.unfoldT = 7;
      race.audio?.sfx('unfold');
      race.toast(kart, 'Superficie desplegada: mira el minimapa.');
    },
  },
  curvboost: {
    id: 'curvboost', icon: '🚀', name: 'Curvature Boost',
    lesson: 'La curvatura local de la superficie da la potencia del turbo.',
    apply(race, kart) {
      const k = Math.abs(kart.signedCurvature(kart.s));
      const power = 1 + Math.min(1.0, k * 55);
      kart.boostT = Math.max(kart.boostT, 1.1 + Math.min(1.2, k * 40));
      kart.boostPower = power;
      race.audio?.sfx('boost');
      race.toast(kart, power > 1.5
        ? '¡Curvatura extrema: turbo potenciado!'
        : 'Curvatura suave: turbo normal.');
    },
  },
  shield: {
    id: 'shield', icon: '🛡️', name: 'Euler Shield',
    lesson: 'V − E + F: la característica de Euler es un invariante topológico.',
    apply(race, kart) {
      kart.shielded = true;
      race.audio?.sfx('shield');
      race.toast(kart, 'Euler Shield activo: V − E + F te protege.');
    },
  },
  oflip: {
    id: 'oflip', icon: '🔄', name: 'Orientation Flip',
    lesson: 'En espacios no orientables tu izquierda puede volverse tu derecha.',
    apply(race, kart) {
      const target = race.kartAhead(kart);
      if (target) {
        const dur = race.track.nonOrientable ? 5 : 3.5;
        if (target.hit(0)) target.flippedControls = dur;
        race.audio?.sfx('flip');
        race.toast(kart, `Orientation Flip lanzado a ${target.name}.`);
        race.toast(target, '¡Tu orientación se ha invertido!');
      } else {
        race.toast(kart, 'Nadie delante a quien invertir…');
      }
    },
  },
};

/** ruleta ponderada: cuanto peor vas, mejores objetos */
export function rollItem(position, total) {
  const behind = total <= 1 ? 0 : (position - 1) / (total - 1); // 0=líder, 1=último
  const weights = [
    ['geodesic', 1.5 + behind],
    ['unfolder', 1.2 + behind * 0.5],
    ['curvboost', 0.8 + behind * 2.2],
    ['shield', 1.0 + (1 - behind)],
    ['oflip', 0.7 + behind * 1.2],
  ];
  let sum = 0;
  for (const [, w] of weights) sum += w;
  let r = Math.random() * sum;
  for (const [id, w] of weights) { r -= w; if (r <= 0) return ITEMS[id]; }
  return ITEMS.geodesic;
}
