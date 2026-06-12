# 🏎️ TopoKarts — Copa de las Superficies Imposibles

Juego de carreras 3D arcade en el navegador donde criaturas geométricas compiten
sobre superficies topológicas: una cinta de Möbius que invierte tu orientación,
un toro con bordes identificados, una superficie de género 2, un plano
hiperbólico y un espacio dodecaédrico cerrado sin borde.

**Cada concepto matemático es una decisión de conducción.**

## Cómo jugar

```bash
npm install
npm run dev      # abre http://localhost:5173
```

- **1 o 2 jugadores locales** (pantalla partida automática).
- Copa de 5 circuitos con puntos acumulados.

### Controles

| Acción | Jugador 1 | Jugador 2 |
| --- | --- | --- |
| Conducir | `W A S D` | `← ↑ ↓ →` |
| Derrape (miniturbo) | `Shift Izq` | `Shift/Ctrl Der` |
| Usar objeto | `E` | `Enter` |
| Mirar atrás | `Q` | `⌫` |
| Respawn | `R` | `P` |

Generales: `Esc` pausa · `M` minimapa normal/topológico · `T` etiqueta educativa · `F` pantalla completa.

## Los 5 circuitos

1. **Möbius Motorway** — no orientabilidad: cada vuelta cruza a "la otra cara" de la misma cinta.
2. **Toro Terminal** — ciclos del toro: 1 vuelta al agujero + 2 al tubo; minimapa = cuadrado con lados pegados.
3. **Double Donut Drift** — género 2: rodear agujeros distintos son caminos no equivalentes.
4. **Hyperbolic Havoc** — curvatura negativa: la geodésica no parece recta, pero lo es.
5. **Poincaré Palace** — espacio cerrado sin borde: caras del dodecaedro identificadas como portales.

## Objetos topológicos

- **〰️ Geodesic Assist** — muestra la geodésica y asiste el giro.
- **🗺️ Surface Unfolder** — despliega la superficie en el minimapa.
- **🚀 Curvature Boost** — turbo proporcional a la curvatura local.
- **🛡️ Euler Shield** — V − E + F te protege de un ataque.
- **🔄 Orientation Flip** — invierte los controles del rival (dura más en espacios no orientables).

## Arquitectura técnica

- **Three.js + Vite**, sin assets externos: geometría, texturas (canvas) y audio (WebAudio) 100 % procedurales.
- Cada circuito es una **spline cerrada** con un marco móvil por **transporte paralelo** más una función de torsión:
  la media torsión (`twistTurns: 0.5`) de la Möbius hace que la inversión de orientación
  *emerja de la geometría*, sin casos especiales en la física.
- La conducción ocurre en **coordenadas de carretera** `(s, q, heading)`; la curvatura con signo
  de la spline acopla el avance con el giro (las curvas "empujan" hacia fuera de verdad).
- Minimapa con dos modos: proyección cenital y **diagrama topológico** (rectángulo de Möbius,
  cuadrado del toro, lemniscata, disco de Poincaré, red de pentágonos).

```bash
npm run build              # build de producción
node scripts/verify.mjs    # smoke test automatizado con capturas (requiere Chrome/Edge)
node scripts/verify-circuits.mjs   # captura los 5 circuitos y la pantalla partida
```

Atajo de desarrollo: `http://localhost:5173/?circuit=N&players=2` salta directo a un circuito.
