import { drawTopoFrame, drawNormalFrame } from './diagrams.js';

const TAU = Math.PI * 2;
const PLAYER_COLORS = ['#46d5ff', '#ff5d8f'];

/** HUD por jugador: velocidad, vuelta, posición, objeto, orientación y minimapa. */
export class Hud {
  constructor(root, playerCount, circuitDef, track) {
    this.root = root;
    this.def = circuitDef;
    this.track = track;
    this.playerCount = playerCount;
    this.topoMode = true; // M alterna
    this.panels = [];

    for (let i = 0; i < playerCount; i++) this._buildPanel(i);
    this._layout();
    this._onResize = () => this._layout();
    window.addEventListener('resize', this._onResize);
  }

  _buildPanel(i) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="top-row">
        <div class="pos-card">
          <div class="position"><span class="pos-n">6</span><sup class="pos-suf">º</sup></div>
          <div class="lap-chip">VUELTA <span class="lap-n">1</span><em>/</em><span class="lap-t">3</span></div>
        </div>
        <div class="item-card">
          <div class="item-slot"><span class="item-icon"></span></div>
          <div class="item-label">OBJETO</div>
        </div>
      </div>
      <div class="bottom-row">
        <div class="speed-card">
          <div class="speed"><span class="speed-n">0</span><small>km/h</small></div>
          <div class="speed-bar"><div class="speed-fill"></div></div>
          <div class="curv-ind">curvatura —</div>
        </div>
        <div class="map-card">
          <div class="map-head">MAPA TOPOLÓGICO <span class="map-key">M</span></div>
          <canvas class="minimap" width="172" height="172"></canvas>
          <div class="orient-badge">orientación →</div>
        </div>
      </div>
      <div class="edu-toast"></div>
      <div class="center-msg"></div>
      <div class="wrong-way">¡SENTIDO CONTRARIO!</div>
      <div class="boost-fx"></div>
      <div class="vignette"></div>
    `;
    this.root.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    this.panels.push({
      el,
      posN: q('.pos-n'), posSuf: q('.pos-suf'), lapN: q('.lap-n'), lapT: q('.lap-t'),
      itemSlot: q('.item-slot'), itemIcon: q('.item-icon'),
      speedN: q('.speed-n'), curvInd: q('.curv-ind'), speedFill: q('.speed-fill'),
      minimap: q('.minimap'), mctx: q('.minimap').getContext('2d'),
      orientBadge: q('.orient-badge'),
      toastEl: q('.edu-toast'), toastT: 0,
      boostFx: q('.boost-fx'),
      centerEl: q('.center-msg'),
      wrongEl: q('.wrong-way'), wrongT: 0,
      flashEl: null,
    });
    this.panels[i].lapT.textContent = this.def.laps ?? 3;
  }

  _layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const rects = this.playerCount === 1
      ? [[0, 0, W, H]]
      : (W >= H
        ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]]
        : [[0, 0, W, H / 2], [0, H / 2, W, H / 2]]);
    rects.forEach(([x, y, w, h], i) => {
      const p = this.panels[i];
      if (!p) return;
      Object.assign(p.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    });

    // divisor de pantalla partida
    if (this.playerCount === 2 && !this._divider) {
      this._divider = document.createElement('div');
      this._divider.className = 'split-divider';
      this.root.appendChild(this._divider);
    }
    if (this._divider) {
      if (W >= H) Object.assign(this._divider.style, { left: W / 2 - 1.5 + 'px', top: 0, width: '3px', height: H + 'px' });
      else Object.assign(this._divider.style, { left: 0, top: H / 2 - 1.5 + 'px', width: W + 'px', height: '3px' });
    }
  }

  toggleMode() { this.topoMode = !this.topoMode; }

  toast(i, msg, secs = 3.4) {
    const p = this.panels[i]; if (!p) return;
    p.toastEl.textContent = msg;
    p.toastEl.classList.add('show');
    p.toastT = secs;
  }

  centerMsg(i, msg) {
    const p = this.panels[i]; if (!p) return;
    p.centerEl.textContent = msg;
    p.centerEl.classList.remove('pop');
    void p.centerEl.offsetWidth; // reinicia la animación
    p.centerEl.classList.add('pop');
  }

  countdown(n) { for (let i = 0; i < this.playerCount; i++) this.centerMsg(i, n === 'GO' ? '¡GO!' : String(n)); }

  flash(i) {
    const p = this.panels[i]; if (!p) return;
    const f = document.createElement('div');
    Object.assign(f.style, {
      position: 'absolute', inset: 0, background: 'white', opacity: 0.65,
      transition: 'opacity .45s', pointerEvents: 'none',
    });
    p.el.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), 500);
  }

  setItem(i, item) {
    const p = this.panels[i]; if (!p) return;
    p.itemSlot.classList.remove('rolling');
    p.itemIcon.textContent = item ? item.icon : '';
    p.itemSlot.title = item ? `${item.name} — ${item.lesson}` : '';
  }

  startRoll(i) {
    const p = this.panels[i]; if (!p) return;
    p.itemSlot.classList.add('rolling');
    p.itemIcon.textContent = '🎲';
  }

  update(race, dt) {
    for (const [i, kart] of race.players.entries()) {
      const p = this.panels[i];
      const pos = race.standings.indexOf(kart) + 1;
      p.posN.textContent = pos;
      p.posSuf.textContent = 'º';
      p.lapN.textContent = Math.min(race.laps, kart.lap + 1);
      p.speedN.textContent = Math.round(Math.abs(kart.v) * 3.6);
      const pct = Math.min(100, Math.abs(kart.v) / 66 * 100);
      p.speedFill.style.width = pct + '%';
      p.speedFill.classList.toggle('boosting', kart.boostT > 0);

      // indicador de curvatura local (gaussiana real en superficies)
      let label;
      if (this.def.id === 'hyper') label = '🜍 negativa (silla)';
      else if (this.track.isSurface) {
        const K = this.track.gaussianAt(kart.s, kart.q);
        label = K > 1e-5 ? '● positiva (esfera)' : K < -1e-5 ? '🜍 negativa (silla)' : '▭ ~plana';
      } else {
        const k = Math.abs(kart.signedCurvature(kart.s));
        label = k > 0.012 ? '● positiva' : k > 0.004 ? '▬ media' : '▭ ~plana';
      }
      p.curvInd.textContent = 'curvatura: ' + label;

      // viñeta de turbo
      p.boostFx.classList.toggle('on', kart.boostT > 0);

      // orientación
      const flipped = kart.orientationFlipped;
      p.orientBadge.textContent = flipped ? '← orientación invertida' : 'orientación →';
      p.orientBadge.classList.toggle('flipped', flipped);

      // controles invertidos por Orientation Flip
      p.el.style.filter = kart.flippedControls > 0 ? 'hue-rotate(160deg)' : '';

      // sentido contrario
      const goingBack = kart.v > 6 && Math.cos(kart.heading) * kart.v < -3;
      p.wrongT = goingBack ? p.wrongT + dt : 0;
      p.wrongEl.classList.toggle('show', p.wrongT > 0.8);

      // toast timer
      if (p.toastT > 0) {
        p.toastT -= dt;
        if (p.toastT <= 0) p.toastEl.classList.remove('show');
      }

      this._drawMinimap(p, race, kart);
    }
  }

  _drawMinimap(p, race, kart) {
    const g = p.mctx;
    const W = p.minimap.width, H = p.minimap.height;
    g.clearRect(0, 0, W, H);

    const unfolding = kart.unfoldT > 0;
    if (unfolding) kart.unfoldT -= 1 / 60;
    const topo = this.topoMode || unfolding;

    let mapper;
    if (topo) {
      mapper = drawTopoFrame(g, this.def.minimap, W, H, { highlight: unfolding });
    } else {
      const toPx = drawNormalFrame(g, this.track, W, H);
      mapper = null;
      // marcar meta
      const [fx, fy] = toPx(this.track.positions[0]);
      g.fillStyle = '#ffd23f';
      g.fillRect(fx - 3, fy - 3, 6, 6);
      for (const other of race.karts) {
        const [x, y] = toPx(other.root.position);
        this._dot(g, x, y, other, kart);
      }
      return;
    }

    // modo topológico: posición por coordenadas de carretera
    const L = this.track.length;
    for (const other of race.karts) {
      const a = (((other.s % L) + L) % L) / L * TAU;
      const w = this.track.widthAt(other.s);
      const q01 = (other.q / w) * 0.5 + 0.5;
      const [x, y] = mapper(a, q01, other.orientationFlipped);
      this._dot(g, x, y, other, kart);
    }

    // portales en Poincaré
    if (this.def.portals && topo) {
      for (const frac of this.def.portals) {
        const [x, y] = mapper(frac * TAU, 0.5, false);
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 5, 0, TAU); g.stroke();
      }
    }
  }

  _dot(g, x, y, other, me) {
    const isMe = other === me;
    const isHuman = other.playerIndex !== undefined;
    g.beginPath();
    g.arc(x, y, isMe ? 5.5 : 3.6, 0, TAU);
    g.fillStyle = isHuman ? PLAYER_COLORS[other.playerIndex] : 'rgba(255,255,255,0.55)';
    g.fill();
    if (isMe) {
      g.lineWidth = 2;
      g.strokeStyle = other.orientationFlipped ? '#111' : '#fff';
      g.stroke();
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    for (const p of this.panels) p.el.remove();
    this._divider?.remove();
  }
}
