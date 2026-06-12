import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track } from '../track/Track.js';
import { TrackScene } from '../track/TrackBuilder.js';
import { Kart } from './Kart.js';
import { BotController } from './Bot.js';
import { CHARACTERS } from './characters.js';
import { readControls, P1_MAP, P2_MAP } from '../core/Input.js';
import { rollItem } from './items.js';
import { FX, SPARK_COLORS } from './Effects.js';

const PLAYER_MAPS = [P1_MAP, P2_MAP];
const TOTAL_RACERS = 6;

export class Race {
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
    this.fx = new FX(this.scene);

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

    this.eduStats = this.players.map(() => ({ wraps: 0, flippedFinish: false, cyclesB: 0 }));
    this._sparkT = 0;
  }

  _buildLights() {
    const theme = this.def.theme;
    const sun = new THREE.DirectionalLight(theme.light, 2.6);
    sun.position.set(120, 220, 80);
    this.scene.add(sun);
    const ambient = new THREE.Color(theme.ambient);
    this.scene.add(new THREE.HemisphereLight(ambient, ambient.clone().multiplyScalar(0.45), 1.6));
    // relleno desde abajo: Möbius y el interior del toro también se conducen
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
    const free = CHARACTERS.filter(c => !playerChars.includes(c));
    for (let i = 0; this.karts.length < TOTAL_RACERS && i < free.length; i++) {
      const kart = new Kart(this.track, free[i], { isBot: true });
      kart.bot = new BotController(kart, difficulty);
      this.bots.push(kart);
      this.karts.push(kart);
    }

    for (const [i, kart] of this.karts.entries()) {
      kart.placeAtGrid(i);
      this.scene.add(kart.root);
      kart.onWrap = (wrap) => this._onWrap(kart, wrap);
      kart._obsCooldown = new Map();
      kart._prevCyclesB = 0;
      kart._prevBoost = 0;
    }
  }

  _buildCameras() {
    this.cameras = this.players.map(() => new THREE.PerspectiveCamera(72, 1, 0.3, 4500));
    this._camState = this.players.map(() => ({
      pos: new THREE.Vector3(0, 20, -20),
      up: new THREE.Vector3(0, 1, 0),
      look: new THREE.Vector3(),
      shake: 0,
    }));
    this.players.forEach((_, i) => this._updateCamera(i, 0, true));
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
  showGeodesic() { /* la línea se actualiza en update() mientras assistT>0 */ }

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

  shake(kart, amount = 1) {
    if (kart.playerIndex !== undefined) {
      const st = this._camState[kart.playerIndex];
      st.shake = Math.min(2, st.shake + amount);
    }
  }

  // ── eventos topológicos ───────────────────────────────────────────
  _onWrap(kart, wrap) {
    if (kart.playerIndex === undefined) return;
    const lap = kart.lap;
    const st = this.eduStats[kart.playerIndex];
    st.wraps = wrap;
    if (this.track.nonOrientable && kart.orientationFlipped) st.flippedFinish = true;
    if (lap >= this.laps) return;
    if (this.def.toasts?.wrap) this.hud?.toast(kart.playerIndex, this.def.toasts.wrap);
    const msg = lap === this.laps - 1 ? '¡ÚLTIMA VUELTA!' : `Vuelta ${lap + 1}/${this.laps}`;
    this.hud?.centerMsg(kart.playerIndex, msg);
    this.audio?.sfx(lap === this.laps - 1 ? 'finalLap' : 'lap');
  }

  _checkHalfLap(kart, prevS) {
    if (!this.def.toasts?.half || kart.playerIndex === undefined) return;
    const L = this.track.length;
    const half = 0.5 * L;
    const a = ((prevS % L) + L) % L, b = ((kart.s % L) + L) % L;
    if (a < half && b >= half) this.hud?.toast(kart.playerIndex, this.def.toasts.half);
  }

  _checkCycleB(kart) {
    // toro: rodear el tubo = ciclo B
    if (!this.track.isSurface || this.track.kind !== 'torus') return;
    const cycles = Math.floor(Math.abs(kart.qTotal) / this.track.lateralPeriod);
    if (cycles > kart._prevCyclesB) {
      kart._prevCyclesB = cycles;
      if (kart.playerIndex !== undefined) {
        this.eduStats[kart.playerIndex].cyclesB = cycles;
        this.hud?.toast(kart.playerIndex, this.def.toasts?.cycleB ?? 'Ciclo B completado.');
        this.audio?.sfx('lap');
        this.fx.burst({
          pos: kart.root.position.clone(), normal: kart._frame.N?.clone() ?? new THREE.Vector3(0, 1, 0),
          count: 30, colors: SPARK_COLORS.confetti, speed: 13, life: 1.0, gravity: 12,
        });
      }
    }
  }

  // ── bucle principal ───────────────────────────────────────────────
  update(dt, input) {
    this.time += dt;
    this.trackScene.update(this.time, dt);
    this.fx.update(dt);

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
        for (const kart of this.karts) kart.syncVisual(dt);
        this.players.forEach((_, i) => this._updateCamera(i, dt));
        this.hud?.update(this, dt);
        return;
      }
    }

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
      kart.update(dt, controls, stats);
      this._kartFx(kart, dt);
      this._checkHalfLap(kart, prevS);
      this._checkCycleB(kart);
    }

    this._pickups(dt);
    this._pads();
    this._obstacleHits();
    this._collisions();
    this._updateStandings();
    this._updateGeodesics();
    this._checkFinish(dt);

    this.players.forEach((_, i) => this._updateCamera(i, dt));
    this.hud?.update(this, dt);
    this.audio?.engines(this.players.map(p => p.v / 46));
  }

  /** chispas de derrape, bordes y turbo */
  _kartFx(kart, dt) {
    this._sparkT -= dt;
    const fr = kart._frame;
    if (!fr.N) return;
    const emit = this._sparkT <= 0;

    if (emit && kart.fx.drift) {
      const charged = kart.driftCharge > 1.1;
      this.fx.burst({
        pos: kart.root.position.clone().addScaledVector(fr.T, -1.6).addScaledVector(fr.N, 0.2),
        normal: fr.N, dir: fr.T.clone().negate(),
        count: 4, colors: charged ? SPARK_COLORS.driftCharged : SPARK_COLORS.drift,
        speed: 7, life: 0.4, size: 0.4, gravity: 30,
      });
    }
    if (emit && kart.fx.edge) {
      this.fx.burst({
        pos: kart.root.position.clone().addScaledVector(fr.B, Math.sign(kart.q) * 1.4),
        normal: fr.N, count: 5, colors: SPARK_COLORS.edge,
        speed: 9, life: 0.35, size: 0.4, gravity: 26,
      });
      if (kart.playerIndex !== undefined) this.shake(kart, 0.12);
    }
    if (kart.fx.miniturbo) {
      kart.fx.miniturbo = false;
      this.fx.burst({
        pos: kart.root.position.clone().addScaledVector(fr.T, -2),
        normal: fr.N, dir: fr.T.clone().negate(),
        count: 16, colors: SPARK_COLORS.boost, speed: 12, life: 0.6, gravity: 8,
      });
      if (kart.playerIndex !== undefined) { this.audio?.sfx('boost'); this.shake(kart, 0.35); }
    }
    // ráfaga al empezar cualquier turbo
    if (kart.boostT > 0 && kart._prevBoost <= 0) {
      this.fx.burst({
        pos: kart.root.position.clone().addScaledVector(fr.T, -2.4),
        normal: fr.N, dir: fr.T.clone().negate(),
        count: 20, colors: SPARK_COLORS.boost, speed: 15, life: 0.7, gravity: 6,
      });
      if (kart.playerIndex !== undefined) this.shake(kart, 0.4);
    }
    kart._prevBoost = kart.boostT;
    if (this._sparkT <= 0) this._sparkT = 0.05;
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
      if (!box.mesh.visible || box.cooldown > 0) continue;
      for (const kart of this.karts) {
        if (kart.item || kart.itemRolling > 0) continue;
        if (kart.root.position.distanceToSquared(box.mesh.position) < 11) {
          box.cooldown = 5;
          box.mesh.visible = false;
          kart.itemRolling = 1.1;
          // ¡explosión de la caja!
          this.fx.burst({
            pos: box.mesh.position.clone(), normal: box.up,
            count: 26, colors: SPARK_COLORS.boxExplode, speed: 11, life: 0.8, size: 0.55, gravity: 16,
          });
          this.fx.burst({
            pos: box.mesh.position.clone(), normal: box.up,
            count: 8, colors: [0xffffff], speed: 4, life: 0.35, size: 1.1, gravity: 2,
          });
          if (kart.playerIndex !== undefined) {
            this.audio?.sfx('pickup');
            this.audio?.sfx('explode');
            this.hud?.startRoll(kart.playerIndex);
            this.shake(kart, 0.18);
          }
          break;
        }
      }
    }
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
        if (kart.root.position.distanceToSquared(pad.pos) < 22) {
          const fr = kart._frame;
          if (fr.N && fr.N.dot(pad.up) > 0.25 && kart.boostT < 0.9) {
            kart.boostT = Math.max(kart.boostT, 1.0);
            kart.boostPower = Math.max(kart.boostPower, 1);
            if (kart.playerIndex !== undefined) this.audio?.sfx('boost');
          }
        }
      }
    }
  }

  _obstacleHits() {
    for (const ob of this.trackScene.obstacles) {
      for (const kart of this.karts) {
        const cool = kart._obsCooldown.get(ob) ?? 0;
        if (this.time < cool) continue;
        for (const c of ob.colliders) {
          const r = ob.radius + 1.3;
          if (kart.root.position.distanceToSquared(c) < r * r) {
            kart._obsCooldown.set(ob, this.time + 1.6);
            const fr = kart._frame;
            this.fx.burst({
              pos: kart.root.position.clone(), normal: fr.N ?? new THREE.Vector3(0, 1, 0),
              count: 14, colors: SPARK_COLORS.hit, speed: 10, life: 0.5, gravity: 22,
            });
            if (ob.type === 'cone') {
              if (kart.hit(0)) {
                kart.v *= 0.5;
                kart.q += Math.sign(kart.q - 0.001) * 1.2;
              }
            } else if (ob.type === 'bumper') {
              if (kart.hit(0.55)) kart.v *= -0.25;
            } else { // spinner
              if (kart.hit(0.85)) kart.v *= 0.2;
            }
            if (kart.playerIndex !== undefined) { this.audio?.sfx('hit'); this.shake(kart, 0.6); }
            break;
          }
        }
      }
    }
  }

  _collisions() {
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
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
          // confeti
          const fr = kart._frame;
          for (let k = 0; k < 3; k++) {
            this.fx.burst({
              pos: kart.root.position.clone().addScaledVector(fr.N ?? new THREE.Vector3(0, 1, 0), 2 + k),
              normal: fr.N ?? new THREE.Vector3(0, 1, 0),
              count: 40, colors: SPARK_COLORS.confetti, speed: 13, life: 1.4, size: 0.7, gravity: 14,
            });
          }
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
    const fr = kart.track.surfaceFrame(kart.s, kart.q, kart.flip, {});

    const lookBack = !snap && this.input?.down?.(PLAYER_MAPS[i].lookBack) && !kart.finished;
    const back = lookBack ? -1 : 1;
    const cos = Math.cos(kart.heading * 0.5), sin = Math.sin(kart.heading * 0.5);
    const fwd = new THREE.Vector3(
      fr.T.x * cos + fr.B.x * sin,
      fr.T.y * cos + fr.B.y * sin,
      fr.T.z * cos + fr.B.z * sin).multiplyScalar(back);

    const dist = 14.5 + kart.v * 0.08;
    const target = kart.root.position.clone()
      .addScaledVector(fwd, -dist)
      .addScaledVector(fr.N, 6.4);

    const lerp = snap ? 1 : 1 - Math.exp(-5.2 * dt);
    st.pos.lerp(target, lerp);
    st.up.lerp(fr.N, snap ? 1 : 1 - Math.exp(-3.4 * dt)).normalize();
    const look = kart.root.position.clone().addScaledVector(fwd, 9).addScaledVector(fr.N, 1.8);
    st.look.lerp(look, snap ? 1 : 1 - Math.exp(-8 * dt));

    // sacudida
    st.shake = Math.max(0, st.shake - dt * 2.4);
    const sh = st.shake * st.shake * 0.5;

    cam.position.copy(st.pos);
    if (sh > 0.001) {
      cam.position.x += (Math.random() - 0.5) * sh;
      cam.position.y += (Math.random() - 0.5) * sh;
      cam.position.z += (Math.random() - 0.5) * sh;
    }
    cam.up.copy(st.up);
    cam.lookAt(st.look);
    cam.fov = THREE.MathUtils.lerp(cam.fov, kart.boostT > 0 ? 84 : 72, snap ? 1 : 1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
  }

  render(renderer) {
    const W = renderer.domElement.clientWidth;
    const H = renderer.domElement.clientHeight;
    const n = this.players.length;

    // 1 jugador: pipeline con bloom
    if (n === 1) {
      if (!this.composer || this._composerRenderer !== renderer) {
        this._composerRenderer = renderer;
        this.composer = new EffectComposer(renderer);
        this._renderPass = new RenderPass(this.scene, this.cameras[0]);
        this._bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.30, 0.5, 0.90);
        this.composer.addPass(this._renderPass);
        this.composer.addPass(this._bloom);
        this.composer.addPass(new OutputPass());
      }
      if (this._cw !== W || this._ch !== H) {
        this._cw = W; this._ch = H;
        this.composer.setSize(W, H);
      }
      const cam = this.cameras[0];
      if (cam.aspect !== W / H) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      this.composer.render();
      return;
    }

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
    if (W >= H) return [[0, 0, W / 2 - 1, H], [W / 2 + 1, 0, W / 2 - 1, H]];
    return [[0, H / 2 + 1, W, H / 2 - 1], [0, 0, W, H / 2 - 1]];
  }

  dispose() {
    this.fx.dispose();
    this.composer?.dispose?.();
    this.scene.traverse(o => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.(); }
    });
  }
}
