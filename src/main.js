import * as THREE from 'three';
import { CIRCUITS } from './track/circuits.js';
import { Race } from './race/Race.js';
import { Hud } from './ui/Hud.js';
import { Input } from './core/Input.js';
import { AudioSys } from './core/Audio.js';
import {
  titleScreen, controlsScreen, playersScreen, charScreen,
  eduScreen, resultsScreen, finalScreen, pauseScreen,
} from './ui/screens.js';
import { createMenuBackground } from './ui/menuBackground.js';

const CUP_POINTS = [10, 8, 6, 5, 4, 3];

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const input = new Input();
const audio = new AudioSys();
const menuBg = createMenuBackground();

// ── estado global del juego ──────────────────────────────────────────
const game = {
  screen: null,        // elemento DOM de pantalla actual
  race: null,
  hud: null,
  paused: false,
  pauseEl: null,
  playerCount: 1,
  playerChars: [],
  circuitIndex: 0,
  cupPoints: new Map(), // name -> { points, isHuman, playerIndex }
};

function setScreen(elm) {
  game.screen?.remove();
  game.screen = elm;
  if (elm) uiRoot.appendChild(elm);
}

// ── flujo de pantallas ───────────────────────────────────────────────
function showTitle() {
  destroyRace();
  game.cupPoints.clear();
  game.circuitIndex = 0;
  setScreen(titleScreen(action => {
    audio.init();
    audio.sfx('select');
    if (action === 'controls') showControls();
    else showPlayers();
  }));
}

function showControls() {
  setScreen(controlsScreen(() => { audio.sfx('back'); showTitle(); }));
}

function showPlayers() {
  setScreen(playersScreen(n => {
    audio.sfx('select');
    game.playerCount = n;
    showChars();
  }));
}

function showChars() {
  setScreen(charScreen(game.playerCount, chars => {
    audio.sfx('select');
    game.playerChars = chars;
    game.circuitIndex = 0;
    game.cupPoints.clear();
    showEdu();
  }));
}

function showEdu() {
  const def = CIRCUITS[game.circuitIndex];
  setScreen(eduScreen(def, game.circuitIndex, () => {
    audio.sfx('select');
    startRace(def);
  }));
}

function startRace(def) {
  setScreen(null);
  destroyRace();

  const hud = new Hud(uiRoot, game.playerCount, def, null);
  const race = new Race(def, {
    playerChars: game.playerChars,
    difficulty: 'normal',
    audio,
    hud,
  });
  hud.track = race.track;
  race.input = input;
  race.onRaceEnd = (standings, eduStats) => showResults(def, standings, eduStats);

  game.race = race;
  game.hud = hud;
  game.paused = false;
  audio.startEngines(game.playerCount);
}

function destroyRace() {
  audio.stopMusic();
  audio.stopEngines();
  game.race?.dispose();
  game.race = null;
  game.hud?.dispose();
  game.hud = null;
  game.pauseEl?.remove();
  game.pauseEl = null;
  game.paused = false;
}

function eduSummaryFor(def, standings, eduStats) {
  const lines = [];
  for (const [i, st] of eduStats.entries()) {
    const tag = eduStats.length > 1 ? `J${i + 1}: ` : '';
    if (def.id === 'sphere') {
      lines.push(tag + 'Recorriste un círculo máximo: en curvatura positiva, ir recto siempre te devuelve al punto de partida (χ = 2).');
    } else if (def.id === 'mobius') {
      lines.push(tag + (st.flippedFinish
        ? '✔ Reto: cruzaste la meta con la orientación invertida. La banda solo tiene una cara.'
        : 'Diste la vuelta a una superficie de una sola cara: cada cruce de meta invierte tu orientación.'));
    } else if (def.id === 'torus') {
      lines.push(tag + (st.cyclesB > 0
        ? `✔ Reto: rodeaste el tubo ${st.cyclesB} vez/veces (ciclo B) además del agujero (ciclo A): π₁(T²) = ℤ×ℤ.`
        : 'Completaste el ciclo A (alrededor del agujero). El ciclo B (alrededor del tubo) quedó pendiente: son vueltas distintas.'));
    } else if (def.id === 'double') {
      lines.push(tag + 'Rodeaste los dos agujeros: caminos que encierran agujeros distintos no son deformables entre sí.');
    } else if (def.id === 'hyper') {
      lines.push(tag + 'En curvatura negativa el espacio “se abre”: las geodésicas que parecían curvas eran el camino corto.');
    }
  }
  return lines.join('<br>');
}

function showResults(def, standings, eduStats) {
  // puntos de copa
  const points = CUP_POINTS;
  standings.forEach((k, i) => {
    const cur = game.cupPoints.get(k.name) ?? { points: 0, isHuman: k.playerIndex !== undefined, playerIndex: k.playerIndex };
    cur.points += points[i] ?? 0;
    game.cupPoints.set(k.name, cur);
  });

  const isLast = game.circuitIndex >= CIRCUITS.length - 1;
  const summary = eduSummaryFor(def, standings, eduStats);
  setScreen(resultsScreen(def, standings, points, summary, isLast, () => {
    audio.sfx('select');
    destroyRace();
    if (isLast) showFinal();
    else { game.circuitIndex++; showEdu(); }
  }));
}

function showFinal() {
  const table = [...game.cupPoints.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.points - a.points);
  setScreen(finalScreen(table, () => { audio.sfx('select'); showTitle(); }));
}

// ── pausa y teclas globales ──────────────────────────────────────────
function togglePause() {
  if (!game.race || game.race.state === 'done') return;
  game.paused = !game.paused;
  if (game.paused) {
    audio.stopMusic();
    game.pauseEl = pauseScreen(game.race.def,
      () => togglePause(),
      () => { showTitle(); });
    uiRoot.appendChild(game.pauseEl);
  } else {
    game.pauseEl?.remove();
    game.pauseEl = null;
    if (game.race.state === 'running') audio.startMusic(game.race.def.id);
  }
}

window.addEventListener('keydown', e => {
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
  if (!game.race || game.paused) return;
  if (e.code === 'KeyM') game.hud?.toggleMode();
  if (e.code === 'KeyT') {
    for (let i = 0; i < game.playerCount; i++) {
      game.hud?.toast(i, `${game.race.def.concept}: ${game.race.def.quote}`, 5);
    }
  }
  // captura del trailer: provoca un único trompo dramático bajo demanda.
  if (e.code === 'KeyK') game.race.players?.[0]?.hit(0.85);
});

// ── bucle principal ──────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (game.race) {
    if (!game.paused) game.race.update(dt, input);
    game.race.render(renderer);
  } else {
    renderer.setScissorTest(false);
    menuBg.render(renderer, now / 1000);
  }
  input.endFrame();
}

// atajo de desarrollo: ?circuit=N salta directo a un circuito
const params = new URLSearchParams(location.search);
const devCircuit = params.get('circuit');
if (devCircuit !== null) {
  import('./race/characters.js').then(({ CHARACTERS }) => {
    audio.enabled = false;
    game.playerCount = +(params.get('players') ?? 1);
    game.playerChars = CHARACTERS.slice(0, game.playerCount);
    game.circuitIndex = Math.min(+devCircuit, CIRCUITS.length - 1);
    startRace(CIRCUITS[game.circuitIndex]);
  });
} else {
  showTitle();
}
requestAnimationFrame(loop);
