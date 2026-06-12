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

1. **Sphere Speedway** — curvatura positiva: sales del polo norte, cruzas el polo sur por las antípodas y vuelves. Toda la esfera es conducible.
2. **Möbius Motorway** — no orientabilidad: cada vuelta cruza a "la otra cara" de la misma cinta.
3. **Toro Terminal** — el toro completo es conducible: ciclo A alrededor del agujero, ciclo B alrededor del tubo (¡por dentro el camino es más corto y hay turbos!).
4. **Double Donut Drift** — género 2: rodear agujeros distintos son caminos no equivalentes.
5. **Hyperbolic Havoc** — curvatura negativa: la geodésica no parece recta, pero lo es.

## Despliegue (Docker / Sliplane)

```bash
docker build -t topokarts .
docker run -p 8080:80 topokarts   # http://localhost:8080
```

En [Sliplane](https://sliplane.io): crea un servicio desde este repositorio; el `Dockerfile`
multi-stage (Node 22 → nginx) se detecta automáticamente y sirve el juego en el puerto 80.

## Objetos topológicos

- **〰️ Geodesic Assist** — muestra la geodésica y asiste el giro.
- **🗺️ Surface Unfolder** — despliega la superficie en el minimapa.
- **🚀 Curvature Boost** — turbo proporcional a la curvatura local.
- **🛡️ Euler Shield** — V − E + F te protege de un ataque.
- **🔄 Orientation Flip** — invierte los controles del rival (dura más en espacios no orientables).

## Arquitectura técnica

- **Three.js + Vite**, sin assets externos: geometría, texturas (canvas) y audio (WebAudio) 100 % procedurales.
- Dos tipos de pista con la misma física:
  - **Cintas**: spline cerrada con marco móvil por **transporte paralelo** + torsión
    (la media torsión de la Möbius hace que la inversión de orientación *emerja de la geometría*).
  - **Superficies completas**: esfera y toro parametrizados analíticamente; la coordenada
    lateral es periódica (en el toro da la vuelta al tubo) y la métrica real de la superficie
    afecta al avance (por dentro del toro el camino es más corto).
- Conducción arcade en **coordenadas de carretera** `(s, q, heading)` con auto-alineado al
  trazado, derrape con miniturbo, barreras con chispas y obstáculos geométricos.
- Bloom (1 jugador), sistema de partículas (explosiones de cajas, chispas de derrape, confeti),
  túneles, aros, fórmulas flotantes de cada figura y sacudida de cámara.
- Minimapa con dos modos: proyección cenital y **diagrama topológico** (esfera con polos,
  rectángulo de Möbius, cuadrado del toro con ciclos A/B, lemniscata, disco de Poincaré).

```bash
npm run build              # build de producción
node scripts/verify.mjs    # smoke test automatizado con capturas (requiere Chrome/Edge)
node scripts/verify-circuits.mjs   # captura los 5 circuitos y la pantalla partida
```

Atajo de desarrollo: `http://localhost:5173/?circuit=N&players=2` salta directo a un circuito.
