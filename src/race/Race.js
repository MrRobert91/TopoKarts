import * as THREE from 'three';
import { Track } from '../track/Track.js';
import { TrackScene } from '../track/TrackBuilder.js';
import { Kart } from './Kart.js';
import { BotController } from './Bot.js';
import { CHARACTERS } from './characters.js';
import { readControls, P1_MAP, P2_MAP } from '../core/Input.js';
import { rollItem } from './items.js';

const PLAYER_MAPS = [P1_MAP, P2_MAP];
const TOTAL_RACERS = 6;

export class Race {
  /**
   * @param {Object} circuitDef definición del circuito
   * @param {Object} opts { playerChars: [char, char?], difficulty, audio, hud }
   */
  constructor(circuitDef, opts) {
    this.def = circuitDef;
    this.opts = opts;
    this.audio = opts.audio;
    this.hud = opts.hud;
    this.laps = circuitDef.laps ?? 3;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(circuitDef.theme.fog, circuitDef.theme.fogDensity);

    this.track = new Track(circuitDef);
    this.trackScene = new TrackScene(this.track);
    this.scene.add(this.trackScene.group);

    this._buildLights();
    this._buildKarts(opts.playerChars, opts.difficulty ?? 'normal');
    this._buildCameras();
    this._buildGeodesicLines();

    this.state = 'countdown';
    this.countdownT = 3.6;
    this.time = 0;
    this.endT = 0;
    this.standings = [...this.karts];
    this.onRaceEnd = null;

    // métricas educativas por jugador (retos)
    this.eduStats = this.players.map(() => ({ portals: new Set(), wraps: 0, flippedFinish: false }));
  }

  _buildLights() {
    const theme = this.def.theme;
    const sun = new THREE.DirectionalLight(theme.light, 2.6);
    sun.position.set(120, 220, 80);
    this.scene.add(sun);
    const ambient = new THREE.Color(theme.ambient);
    this.scene.add(new THREE.HemisphereLight(ambient, ambient.clone().multiplyScalar(0.45), 1.6));
    // luz de relleno desde abajo: en la Möbius también se conduce por la cara inferior
    const fill = new THREE.DirectionalLight(theme.ambient, 1.3);
    fill.position.set(-150, -220, -120);
    this.scene.add(fill);
  }

  _buildKarts(playerChars, difficulty) {
    this.karts = [];
    this.players = [];
    this.bots = [];

    for (const [i, ch] of playerChars.entries()) {
      const kart = new Kart(this.track, ch, { name: i === 0 ? `${ch.name} (J1)` : `${ch.name} (J2)` });
      kart.playerIndex = i;
      this.players.push(kart);
      this.karts.push(kart);
    }
    // bots: personajes no elegidos
    const free = CHARACTERS.filter(c => !playerChars.includes(c));
    for (let i = 0; this.karts.length < TOTAL_RACERS && i < free.length; i++) {
      const kart = new Kart(this.track, free[i], { isBot: true });
      kart.bot = new BotController(kart, difficulty);
      this.bots.push(kart);
      this.karts.push(kart);
    }

    for (const [i, kart] of this.karts.entries()) {
      kart.placeAtGrid(i, this.karts.length);
      this.scene.add(kart.root);
      kart.onWrap = (wrap) => this._onWrap(kart, wrap);
      kart._lastPortalCheck = 0;
      kart._halfToastWrap = -1;
    }
  }

  _buildCameras() {
    this.cameras = this.players.map(() => {
      const cam = new THREE.PerspectiveCamera(72, 1, 0.3, 4500);
      cam.position.set(0, 30, -30);
      return cam;
    });
    this._camState = this.players.map(() => ({
      pos: new THREE.Vector3(0, 20, -20),
      up: new THREE.Vector3(0, 1, 0),
      look: new THREE.Vector3(),
    }));
    // primer encuadre instantáneo
    this.players.forEach((k, i) => this._updateCamera(i, 0, true));
  }

  _buildGeodesicLines() {
    this.geoLines = this.players.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x7dffea, transparent: true, opacity: 0.95, toneMapped: false,
      }));
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      return line;
    });
  }

  // ── API para objetos ──────────────────────────────────────────────
  showGeodesic(kart, secs) { /* la línea se actualiza en update() mientras assistT>0 */ }

  toast(kart, msg) {
    if (kart.playerIndex !== undefined) this.hud?.toast(kart.playerIndex, msg);
  }

  kartAhead(kart) {
    const idx = this.standings.indexOf(kart);
    return idx > 0 ? this.standings[idx - 1] : null;
  }

  bestHumanProgress() {
    let best = null;
    for (const p of this.players) best = best === null ? p.s : Math.max(best, p.s);
    return best;
  }

  // ── eventos topológicos ───────────────────────────────────────────
  _onWrap(kart, wrap) {
    const isHuman = kart.playerIndex !== undefined;
    const lap = kart.lap;

    if (isHuman) {
      const st = this.eduStats[kart.playerIndex];
      st.wraps = wrap;
      if (this.track.nonOrientable && kart.orientationFlipped) st.flippedFinish = true;

      if (lap >= this.laps) return; // el final se gestiona en update
      if (this.def.toasts?.wrap) this.hud?.toast(kart.playerIndex, this.def.toasts.wrap);
      const msg = lap === this.laps - 1 ? '¡ÚLTIMA VUELTA!' : `Vuelta ${lap + 1}/${this.laps}`;
      this.hud?.centerMsg(kart.playerIndex, msg);
      this.audio?.sfx(lap === this.laps - 1 ? 'finalLap' : 'lap');
    }
  }

  _checkPortals(kart, prevS, dt) {
    const portals = this.def.portals;
    if (!portals) return;
    const L = this.track.length;
    for (const [pi, frac] of portals.entries()) {
      const ps = frac * L;
      const a = ((prevS % L) + L) % L, b = ((kart.s % L) + L) % L;
      const crossed = (a < ps && b >= ps) || (a > b && (ps > a || ps <= b)); // con wrap
      if (crossed && a !== b) {
        if (kart.playerIndex !== undefined) {
          this.eduStats[kart.playerIndex].portals.add(pi);
          this.hud?.toast(kart.playerIndex, this.def.toasts?.portal ?? 'Cara conectada atravesada.');
          this.hud?.flash(kart.playerIndex);
          this.audio?.sfx('portal');
        }
      }
    }
  }

  _checkHalfLap(kart, prevS) {
    if (!this.def.toasts?.half || kart.playerIndex === undefined) return;
    const L = this.track.length;
    const half = 0.5 * L;
    const a = ((prevS % L) + L) % L, b = ((kart.s % L) + L) % L;
    if (a < half && b >= half) {
      this.hud?.toast(kart.playerIndex, this.def.toasts.half);
    }
  }

  // ── bucle principal ───────────────────────────────────────────────
  update(dt, input) {
    this.time += dt;
    this.trackScene.update(this.time, dt);

    // cuenta atrás
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.countdownT);
      this.countdownT -= dt;
      const now = Math.ceil(this.countdownT);
      if (now !== prev && now > 0) { this.hud?.countdown(now); this.audio?.sfx('beep'); }
      if (this.countdownT <= 0.6 && this.state === 'countdown') {
        this.state = 'running';
        this.hud?.countdown('GO');
        this.audio?.sfx('go');
        this.audio?.startMusic(this.def.id);
      } else {
        if (this.countdownT > 3.4) this.hud?.countdown(3);
        // los karts se quedan quietos pero se animan
        for (const kart of this.karts) kart.syncVisual(0, dt);
        this.players.forEach((_, i) => this._updateCamera(i, dt));
        return;
      }
    }

    // controles y física
    for (const kart of this.karts) {
      const prevS = kart.s;
      let controls, stats;
      if (kart.bot) {
        controls = kart.bot.update(dt, this);
        stats = kart.bot.stats;
      } else if (kart.finished) {
        kart.autoBot ??= new BotController(kart, 'easy');
        controls = kart.autoBot.update(dt, this);
        stats = kart.character.stats;
      } else {
        controls = readControls(input, PLAYER_MAPS[kart.playerIndex]);
        stats = kart.character.stats;
        if (controls.respawn) kart.forceRespawn();
        if (controls.item) this._useItem(kart);
      }
      const wasFalling = kart.fallT > 0;
      kart.update(dt, controls, stats);
      if (!wasFalling && kart.fallT > 0 && kart.playerIndex !== undefined) this.audio?.sfx('fall');

      this._checkPortals(kart, prevS, dt);
      this._checkHalfLap(kart, prevS);
    }

    this._pickups(dt);
    this._pads();
    this._collisions(dt);
    this._updateStandings();
    this._updateGeodesics();
    this._checkFinish(dt);

    this.players.forEach((_, i) => this._updateCamera(i, dt));
    this.hud?.update(this, dt);
    this.audio?.engines(this.players.map(p => p.v / 46));
  }

  _useItem(kart) {
    if (!kart.item || kart.itemRolling > 0) return;
    const item = kart.item;
    kart.item = null;
    this.hud?.setItem(kart.playerIndex, null);
    item.apply(this, kart);
  }

  _pickups(dt) {
    for (const box of this.trackScene.itemBoxes) {
      if (!box.mesh.visible) continue;
      for (const kart of this.karts) {
        if (kart.item || kart.itemRolling > 0 || kart.fallT > 0) continue;
        if (kart.root.position.distanceToSquared(box.pos) < 9.5) {
          box.cooldown = 5;
          box.mesh.visible = false;
          kart.itemRolling = 1.1;
          if (kart.playerIndex !== undefined) {
            this.audio?.sfx('pickup');
            this.hud?.startRoll(kart.playerIndex);
          }
        }
      }
    }
    // resolver ruletas
    for (const kart of this.karts) {
      if (kart.itemRolling > 0) {
        kart.itemRolling -= dt;
        if (kart.itemRolling <= 0) {
          const pos = this.standings.indexOf(kart) + 1;
          kart.item = rollItem(pos, this.karts.length);
          if (kart.playerIndex !== undefined) this.hud?.setItem(kart.playerIndex, kart.item);
        }
      }
    }
  }

  _pads() {
    for (const pad of this.trackScene.boostPads) {
      for (const kart of this.karts) {
        if (kart.fallT > 0) continue;
        if (kart.root.position.distanceToSquared(pad.pos) < 22) {
          // misma cara de la superficie
          const fr = kart.track.frameAt(kart.s, kart.flip, kart._frame);
          if (fr.N.dot(pad.up) > 0.25 && kart.boostT < 0.9) {
            kart.boostT = Math.max(kart.boostT, 1.0);
            kart.boostPower = Math.max(kart.boostPower, 1);
            if (kart.playerIndex !== undefined) this.audio?.sfx('boost');
          }
        }
      }
    }
  }

  _collisions(dt) {
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
        if (a.fallT > 0 || b.fallT > 0) continue;
        const d2 = a.root.position.distanceToSquared(b.root.position);
        if (d2 < 7.5 && d2 > 0.001) {
          const push = (2.75 - Math.sqrt(d2)) * 0.6;
          const dir = Math.sign(a.q - b.q) || (Math.random() > 0.5 ? 1 : -1);
          a.q += dir * push;
          b.q -= dir * push;
          const va = a.v;
          a.v = a.v * 0.85 + b.v * 0.12;
          b.v = b.v * 0.85 + va * 0.12;
        }
      }
    }
  }

  _updateStandings() {
    this.standings = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.s - a.s;
    });
  }

  _updateGeodesics() {
    for (const [i, kart] of this.players.entries()) {
      const line = this.geoLines[i];
      line.visible = kart.assistT > 0;
      if (!line.visible) continue;
      const attr = line.geometry.getAttribute('position');
      const tmp = new THREE.Vector3();
      for (let p = 0; p < 80; p++) {
        const s = kart.s + p * 2.2;
        this.track.worldPoint(s, 0, kart.flip, 1.1, tmp);
        attr.setXYZ(p, tmp.x, tmp.y, tmp.z);
      }
      attr.needsUpdate = true;
    }
  }

  _checkFinish(dt) {
    for (const kart of this.karts) {
      if (!kart.finished && kart.lap >= this.laps) {
        kart.finished = true;
        kart.finishTime = this.time;
        if (kart.playerIndex !== undefined) {
          const pos = this.standings.indexOf(kart) + 1;
          this.hud?.centerMsg(kart.playerIndex, pos === 1 ? '🏆 ¡META!' : `META · ${pos}º`);
          this.audio?.sfx('finish');
        }
      }
    }
    if (this.state === 'running' && this.players.every(p => p.finished)) {
      this.state = 'ending';
      this.endT = 2.2;
    }
    if (this.state === 'ending') {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.state = 'done';
        this.audio?.stopMusic();
        this.onRaceEnd?.(this.standings, this.eduStats);
      }
    }
  }

  _updateCamera(i, dt, snap = false) {
    const kart = this.players[i];
    const cam = this.cameras[i];
    const st = this._camState[i];
    const fr = kart.track.frameAt(kart.s, kart.flip, {});

    const lookBack = !kart.bot && !snap && this.input?.down?.(PLAYER_MAPS[i].lookBack);
    const cos = Math.cos(kart.heading * 0.5), sin = Math.sin(kart.heading * 0.5);
    const fwd = new THREE.Vector3(
      fr.T.x * cos + fr.B.x * sin,
      fr.T.y * cos + fr.B.y * sin,
      fr.T.z * cos + fr.B.z * sin);

    const dist = 14.5 + kart.v * 0.08;
    const target = kart.root.position.clone()
      .addScaledVector(fwd, -dist)
      .addScaledVector(fr.N, 6.4);

    const lerp = snap ? 1 : 1 - Math.exp(-5.2 * dt);
    st.pos.lerp(target, lerp);
    st.up.lerp(fr.N, snap ? 1 : 1 - Math.exp(-3.4 * dt)).normalize();
    const look = kart.root.position.clone().addScaledVector(fwd, 9).addScaledVector(fr.N, 1.8);
    st.look.lerp(look, snap ? 1 : 1 - Math.exp(-8 * dt));

    cam.position.copy(st.pos);
    cam.up.copy(st.up);
    cam.lookAt(st.look);
    cam.fov = THREE.MathUtils.lerp(cam.fov, kart.boostT > 0 ? 82 : 72, snap ? 1 : 1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
  }

  render(renderer) {
    const W = renderer.domElement.clientWidth;
    const H = renderer.domElement.clientHeight;
    const n = this.players.length;
    renderer.setScissorTest(true);

    const views = this._viewRects(W, H);
    for (let i = 0; i < n; i++) {
      const [x, y, w, h] = views[i];
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      const cam = this.cameras[i];
      if (cam.aspect !== w / h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
      renderer.render(this.scene, cam);
    }
    renderer.setScissorTest(false);
  }

  _viewRects(W, H) {
    if (this.players.length === 1) return [[0, 0, W, H]];
    if (W >= H) return [[0, 0, W / 2 - 1, H], [W / 2 + 1, 0, W / 2 - 1, H]]; // vertical split
    return [[0, H / 2 + 1, W, H / 2 - 1], [0, 0, W, H / 2 - 1]];             // horizontal split
  }

  dispose() {
    this.scene.traverse(o => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.(); }
    });
  }
}
