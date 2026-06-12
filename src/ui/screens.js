import * as THREE from 'three';
import { CHARACTERS } from '../race/characters.js';
import { buildKart } from '../race/KartVisual.js';
import { drawTopoFrame } from './diagrams.js';

export function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

/** renderiza un retrato 3D de cada personaje (una vez, cacheado) */
let _portraits = null;
export function characterPortraits() {
  if (_portraits) return _portraits;
  const size = 220;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  cam.position.set(4.2, 3.6, 6.4);
  cam.lookAt(0, 1.2, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.position.set(3, 6, 5);
  scene.add(sun, new THREE.HemisphereLight(0xbfd0ff, 0x202040, 1.2));

  _portraits = {};
  for (const ch of CHARACTERS) {
    const { root } = buildKart(ch);
    root.rotation.y = 0.6;
    scene.add(root);
    renderer.render(scene, cam);
    _portraits[ch.id] = renderer.domElement.toDataURL();
    scene.remove(root);
  }
  renderer.dispose();
  return _portraits;
}

export function titleScreen(onPlay) {
  const s = el(`
    <div class="screen">
      <div class="logo">TOPOKARTS</div>
      <div class="tagline">Copa de las Superficies Imposibles</div>
      <div class="menu-list">
        <button class="btn primary" data-a="play">JUGAR</button>
        <button class="btn ghost" data-a="controls">CONTROLES</button>
      </div>
      <div class="hint">Carreras sobre cintas de Möbius, toros y espacios imposibles</div>
    </div>`);
  s.querySelector('[data-a=play]').onclick = () => onPlay('play');
  s.querySelector('[data-a=controls]').onclick = () => onPlay('controls');
  return s;
}

export function controlsScreen(onBack) {
  const s = el(`
    <div class="screen">
      <h2 class="screen-title">Controles</h2>
      <div class="controls-cols">
        <div>
          <h4>Jugador 1</h4>
          <p><span class="kbd">W A S D</span> conducir</p>
          <p><span class="kbd">Shift Izq</span> derrape</p>
          <p><span class="kbd">E</span> objeto · <span class="kbd">Q</span> mirar atrás</p>
          <p><span class="kbd">R</span> respawn</p>
        </div>
        <div>
          <h4>Jugador 2</h4>
          <p><span class="kbd">← ↑ ↓ →</span> conducir</p>
          <p><span class="kbd">Ctrl Der</span> derrape</p>
          <p><span class="kbd">Enter</span> objeto · <span class="kbd">⌫</span> mirar atrás</p>
          <p><span class="kbd">P</span> respawn</p>
        </div>
        <div>
          <h4>Generales</h4>
          <p><span class="kbd">Esc</span> pausa</p>
          <p><span class="kbd">M</span> minimapa normal/topológico</p>
          <p><span class="kbd">T</span> etiqueta educativa</p>
          <p><span class="kbd">F</span> pantalla completa</p>
        </div>
      </div>
      <button class="btn">VOLVER</button>
    </div>`);
  s.querySelector('.btn').onclick = onBack;
  return s;
}

export function playersScreen(onPick) {
  const s = el(`
    <div class="screen">
      <h2 class="screen-title">¿Cuántos pilotos?</h2>
      <div class="menu-list">
        <button class="btn primary" data-n="1">1 JUGADOR</button>
        <button class="btn" data-n="2">2 JUGADORES · pantalla partida</button>
      </div>
      <div class="hint">En 2 jugadores: J1 usa WASD, J2 usa las flechas</div>
    </div>`);
  for (const b of s.querySelectorAll('.btn')) b.onclick = () => onPick(+b.dataset.n);
  return s;
}

export function charScreen(playerCount, onDone) {
  const portraits = characterPortraits();
  const s = el(`
    <div class="screen">
      <h2 class="screen-title">Elige tu piloto</h2>
      <div class="hint pick-hint">Jugador 1: haz clic en un personaje</div>
      <div class="char-grid"></div>
    </div>`);
  const grid = s.querySelector('.char-grid');
  const hint = s.querySelector('.pick-hint');
  const picks = [];

  for (const ch of CHARACTERS) {
    const card = el(`
      <div class="char-card" data-id="${ch.id}">
        <img src="${portraits[ch.id]}" width="110" height="110" alt="${ch.name}">
        <div class="char-name" style="color:#${ch.color.toString(16).padStart(6, '0')}">${ch.name}</div>
        <div class="char-trait">${ch.trait}</div>
        <div class="char-trait">${ch.personality}</div>
      </div>`);
    card.onclick = () => {
      if (picks.length >= playerCount) return;
      if (picks.includes(ch)) return;
      picks.push(ch);
      card.classList.add(picks.length === 1 ? 'sel-p1' : 'sel-p2');
      card.appendChild(el(`<div class="char-tag p${picks.length}">J${picks.length}</div>`));
      if (picks.length < playerCount) {
        hint.textContent = `Jugador ${picks.length + 1}: elige tu personaje`;
      } else {
        hint.textContent = '¡A correr!';
        setTimeout(() => onDone(picks), 450);
      }
    };
    grid.appendChild(card);
  }
  return s;
}

export function eduScreen(circuitDef, index, onStart) {
  const s = el(`
    <div class="screen">
      <div class="edu-card">
        <div class="circuit-no">CIRCUITO ${index + 1} / 5</div>
        <h2>${circuitDef.name}</h2>
        <div class="concept">Concepto: ${circuitDef.concept}</div>
        <canvas class="diagram" width="280" height="190"></canvas>
        <div class="quote">“${circuitDef.quote}”</div>
        <div class="quote" style="border-color:#ffd23f">Reto: ${circuitDef.challenge}</div>
        <button class="btn primary">¡A LA PARRILLA!</button>
      </div>
    </div>`);
  const canvas = s.querySelector('.diagram');
  drawTopoFrame(canvas.getContext('2d'), circuitDef.minimap, canvas.width, canvas.height, { highlight: true });
  s.querySelector('.btn').onclick = onStart;
  return s;
}

const ORDINAL = ['1º', '2º', '3º', '4º', '5º', '6º'];

export function resultsScreen(circuitDef, standings, points, eduSummary, isLast, onNext) {
  const rows = standings.map((k, i) => `
    <tr class="${k.playerIndex !== undefined ? 'human' + (k.playerIndex === 1 ? ' p2' : '') : ''}">
      <td class="pos">${ORDINAL[i]}</td>
      <td>${k.name}</td>
      <td class="pts">+${points[i] ?? 0} pts</td>
    </tr>`).join('');

  const s = el(`
    <div class="screen">
      <div class="edu-card">
        <div class="circuit-no">${circuitDef.name} · RESULTADOS</div>
        <table class="results-table"><tbody>${rows}</tbody></table>
        <div class="quote">${eduSummary}</div>
        <button class="btn primary">${isLast ? 'CLASIFICACIÓN FINAL' : 'SIGUIENTE CIRCUITO'}</button>
      </div>
    </div>`);
  s.querySelector('.btn').onclick = onNext;
  return s;
}

export function finalScreen(table, onDone) {
  const rows = table.map((r, i) => `
    <tr class="${r.isHuman ? 'human' + (r.playerIndex === 1 ? ' p2' : '') : ''}">
      <td class="pos">${i === 0 ? '🏆' : ORDINAL[i]}</td>
      <td>${r.name}</td>
      <td class="pts">${r.points} pts</td>
    </tr>`).join('');
  const s = el(`
    <div class="screen">
      <h2 class="screen-title">Copa de las Superficies Imposibles</h2>
      <table class="results-table"><tbody>${rows}</tbody></table>
      <div class="quote" style="max-width:560px">Has corrido sobre una banda no orientable, un toro, una superficie de género 2, un plano hiperbólico y un espacio cerrado sin borde. Cada curva era un teorema.</div>
      <button class="btn primary">VOLVER AL TÍTULO</button>
    </div>`);
  s.querySelector('.btn').onclick = onDone;
  return s;
}

export function pauseScreen(circuitDef, onResume, onQuit) {
  const s = el(`
    <div class="screen" id="pause-overlay">
      <div class="edu-card">
        <h2>PAUSA</h2>
        <div class="concept">${circuitDef.name} — ${circuitDef.concept}</div>
        <div class="quote">“${circuitDef.quote}”</div>
        <button class="btn primary" data-a="resume">REANUDAR</button>
        <button class="btn ghost" data-a="quit">ABANDONAR COPA</button>
      </div>
    </div>`);
  s.querySelector('[data-a=resume]').onclick = onResume;
  s.querySelector('[data-a=quit]').onclick = onQuit;
  return s;
}
