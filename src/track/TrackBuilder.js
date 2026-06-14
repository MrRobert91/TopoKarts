import * as THREE from 'three';
import {
  roadTexture, finishTexture, symbolTexture, boostTexture,
  poincareDiscTexture, textSprite, surfaceTexture, formulaSprite, glowTexture,
  hazardTexture, coneStripesTexture, noiseBumpTexture,
} from './textures.js';
import { addMathDecor } from './mathDecor.js';

const SYMBOLS = ['∞', 'χ', 'π', '⇄', '◯', '⬠', '△'];

// modo "limpio" para grabar el trailer: sin obstáculos que provoquen trompos.
// Se activa con ?clean=1 y NO afecta a la partida normal.
const CLEAN_RUN = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('clean') === '1';

// grosor de la losa de carretera (cinta). La superficie por la que se conduce
// es la cara superior, a ROAD_THICK/2 sobre la línea central a lo largo de N.
const ROAD_THICK = 3.2;

/**
 * Construye toda la escena visual de un circuito: superficie/carretera,
 * meta, cajas de objetos, turbos, aros, túneles, obstáculos, fórmulas
 * flotantes, decorado y cielo.
 */
export class TrackScene {
  constructor(track) {
    this.track = track;
    this.group = new THREE.Group();
    this.animated = [];
    this.itemBoxes = [];
    this.boostPads = [];
    this.obstacles = [];
    // en cintas (ribbon) la cara de rodadura está elevada media losa sobre la
    // línea central; las superficies (esfera/toro) no tienen grosor.
    this.roadLift = track.isSurface ? 0 : ROAD_THICK / 2;

    this._buildSky();
    if (track.isSurface) this._buildSurface();
    else this._buildRibbon();
    this._buildFinish();
    this._buildItemBoxes();
    this._buildBoostPads();
    this._buildRings();
    this._buildTunnels();
    this._buildObstacles();
    this._buildFormulas();
    this._buildSparkles();
    this._buildDecor();
    this._buildSpectacle();
    addMathDecor(this);

    // todo lo construido proyecta sombra (salvo cielo, pista y transparencias)
    this.group.traverse(o => {
      if (o.isMesh && !o.userData.noShadow && !o.material?.transparent) {
        o.castShadow = true;
      }
    });
  }

  update(t, dt) {
    for (const fn of this.animated) fn(t, dt);
    for (const box of this.itemBoxes) {
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        if (box.cooldown <= 0) {
          box.mesh.visible = true;
          box.mesh.scale.setScalar(0.01);
        }
      }
      if (box.mesh.visible) {
        if (box.mesh.scale.x < 1) box.mesh.scale.setScalar(Math.min(1, box.mesh.scale.x + dt * 3));
        box.shell.rotation.y = t * 1.4 + box.phase;
        box.core.rotation.y = -t * 2.2;
        box.core.rotation.z = t * 1.3;
        if (box.ring) { box.ring.rotation.z = t * 1.1 + box.phase; }
        const bob = Math.sin(t * 2.2 + box.phase) * 0.35;
        box.mesh.position.copy(box.basePos).addScaledVector(box.up, bob);
        box.glow.material.opacity = 0.13 + 0.07 * Math.sin(t * 3.5 + box.phase);
      }
    }
    for (const ob of this.obstacles) ob.tick?.(t, dt);
  }

  /** punto y marco sobre la superficie (h = altura sobre la normal) */
  _frame(sFrac, q, h = 0) {
    const s = sFrac * this.track.length;
    const fr = this.track.surfaceFrame(s, q, 0, {});
    const pos = fr.pos.clone().addScaledVector(fr.N, h);
    return { s, pos, T: fr.T.clone(), N: fr.N.clone(), B: fr.B.clone() };
  }

  _orient(mesh, fr) {
    // base directa (det +1): x = N×T = −B
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      fr.B.clone().negate(), fr.N, fr.T));
  }

  // ── cielo ──────────────────────────────────────────────────────────
  _buildSky() {
    const theme = this.track.def.theme;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(theme.skyTop) },
        bottom: { value: new THREE.Color(theme.skyBottom) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 c = mix(bottom, top, smoothstep(0.12, 0.88, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 16), mat);
    skyMesh.userData.noShadow = true;
    this.group.add(skyMesh);

    // estrellas
    const N = 1100;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1400 + Math.random() * 600);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85,
    }));
    this.group.add(stars);
    this.animated.push(t => { stars.rotation.y = t * 0.004; });

    // nebulosas de color
    const colors = ['#' + theme.edge.toString(16).padStart(6, '0'), '#' + theme.edge2.toString(16).padStart(6, '0')];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(colors[i % 2]), transparent: true, opacity: 0.10,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const a = (i / 6) * Math.PI * 2 + 0.4;
      sp.position.set(1300 * Math.cos(a), 280 * Math.sin(i * 2.1) + 180, 1300 * Math.sin(a));
      sp.scale.setScalar(900 + (i % 3) * 350);
      this.group.add(sp);
    }
  }

  // ── superficie completa (esfera / toro) ───────────────────────────
  _buildSurface() {
    const tr = this.track;
    const theme = tr.def.theme;
    const P = tr.lateralPeriod;
    // la esfera solo necesita medio período lateral para cubrirse una vez
    const qSpan = tr.kind === 'sphere' ? P / 2 : P;
    const vMin = 0.5 - qSpan / (2 * P), vMax = 0.5 + qSpan / (2 * P);

    const nS = 280, nQ = 100;
    const positions = [], normals = [], uvs = [], indices = [];
    const fr = {};
    for (let i = 0; i <= nS; i++) {
      const s = (i / nS) * tr.length;
      for (let j = 0; j <= nQ; j++) {
        const q = (j / nQ - 0.5) * qSpan;
        tr.surfaceFrame(s, q, 0, fr);
        positions.push(fr.pos.x, fr.pos.y, fr.pos.z);
        normals.push(fr.N.x, fr.N.y, fr.N.z);
        uvs.push(i / nS * 4 % 4 / 4 + i / nS * 0, 0); // placeholder, se fija abajo
        uvs[uvs.length - 2] = i / nS;
        uvs[uvs.length - 1] = j / nQ * (vMax - vMin) + vMin;
      }
    }
    for (let i = 0; i < nS; i++)
      for (let j = 0; j < nQ; j++) {
        const a = i * (nQ + 1) + j, b = a + nQ + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    const tex = surfaceTexture(theme, {
      bandFrac: tr.bandHalf / P,
      formulas: tr.def.formulas ?? [],
      vMin, vMax,
    });
    const surfBump = noiseBumpTexture(256, 60);
    surfBump.repeat.set(40, 16);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
      bumpMap: surfBump, bumpScale: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData.noShadow = true;
    this.group.add(mesh);

    // marcas de polos en la esfera
    if (tr.kind === 'sphere') {
      for (const [frac, label] of [[0, 'POLO N'], [0.5, 'POLO S']]) {
        const f = this._frame(frac, 0, 0.3);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(6, 0.4, 8, 40),
          new THREE.MeshBasicMaterial({ color: theme.edge2, toneMapped: false }));
        ring.position.copy(f.pos);
        this._orient(ring, f);
        ring.rotateX(Math.PI / 2);
        this.group.add(ring);
        const sign = textSprite(label, { color: '#ffd23f' });
        sign.scale.set(13, 3.25, 1);
        sign.position.copy(f.pos).addScaledVector(f.N, 24);
        this.group.add(sign);
      }
    }
  }

  // ── carretera tipo cinta ───────────────────────────────────────────
  _buildRibbon() {
    const tr = this.track;
    const theme = tr.def.theme;
    const nSeg = Math.max(200, Math.round(tr.length / 1.4));
    const thick = ROAD_THICK; // losa de carretera con grosor real, nada de plano fino

    const roadBump = noiseBumpTexture(256, 70);
    roadBump.repeat.set(6, 60);
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture(theme), roughness: 0.97, metalness: 0,
      bumpMap: roadBump, bumpScale: 0.6,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.edge2).multiplyScalar(0.42), roughness: 0.95, metalness: 0,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: theme.edge, toneMapped: false });
    const glowMat2 = new THREE.MeshBasicMaterial({ color: theme.edge2, toneMapped: false });

    const fr = {};
    const ribbon = (qFn, yFn, mat, flipWinding = false) => {
      const positions = [], uvs = [], indices = [], normals = [];
      for (let i = 0; i <= nSeg; i++) {
        const s = (i / nSeg) * tr.length;
        tr.frameAt(s, 0, fr);
        const w = tr.widthAt(s);
        for (const side of [0, 1]) {
          const q = qFn(side, w), y = yFn(side, w);
          positions.push(
            fr.pos.x + fr.B.x * q + fr.N.x * y,
            fr.pos.y + fr.B.y * q + fr.N.y * y,
            fr.pos.z + fr.B.z * q + fr.N.z * y);
          const ny = flipWinding ? -1 : 1;
          normals.push(fr.N.x * ny, fr.N.y * ny, fr.N.z * ny);
          // un tile de textura cada ~80 m para que el asfalto no se estire
          uvs.push(side, (i / nSeg) * tr.length / 80);
        }
      }
      for (let i = 0; i < nSeg; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (flipWinding) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.userData.noShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    for (const surf of [{ y: thick / 2, flip: false }, { y: -thick / 2, flip: true }]) {
      ribbon((side, w) => (side ? w : -w), () => surf.y, roadMat, surf.flip);
    }
    ribbon((side, w) => -w, (side) => side ? thick / 2 : -thick / 2, sideMat, true);
    ribbon((side, w) => w, (side) => side ? thick / 2 : -thick / 2, sideMat, false);
    for (const y of [thick / 2 + 0.04, -thick / 2 - 0.04]) {
      ribbon((side, w) => -w + (side ? 1.3 : 0), () => y, glowMat, y < 0);
      ribbon((side, w) => w - (side ? 0 : 1.3), () => y, glowMat2, y < 0);
    }
  }

  _buildFinish() {
    const tr = this.track;
    const w = tr.isSurface ? tr.bandHalf + 1 : tr.widthAt(0);
    const geo = new THREE.BoxGeometry(w * 2, 4, 0.4); // losa a cuadros con grosor
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: finishTexture(), toneMapped: false }));
    const f0 = this._frame(0, 0, 0.62);
    mesh.position.copy(f0.pos);
    this._orient(mesh, f0);
    mesh.rotateX(-Math.PI / 2);
    this.group.add(mesh);
    if (tr.nonOrientable) {
      const f1 = this._frame(0, 0, -0.62);
      const m2 = mesh.clone();
      m2.position.copy(f1.pos);
      m2.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        f1.B.clone(), f1.N.clone().negate(), f1.T));
      m2.rotateX(-Math.PI / 2);
      this.group.add(m2);
    }

    // arco de meta con neón
    const theme = tr.def.theme;
    const arcMat = new THREE.MeshStandardMaterial({ color: 0xe8eaf2, roughness: 0.95, metalness: 0 });
    const neonMat = new THREE.MeshBasicMaterial({ color: theme.edge, toneMapped: false });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 12, 12), arcMat);
      pillar.position.copy(f0.pos).addScaledVector(f0.B, side * (w + 2)).addScaledVector(f0.N, 6);
      pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f0.N);
      this.group.add(pillar);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 12, 8), neonMat);
      tube.position.copy(pillar.position).addScaledVector(f0.T, 0.8);
      tube.quaternion.copy(pillar.quaternion);
      this.group.add(tube);
    }
    const bar = new THREE.Mesh(new THREE.TorusGeometry(w + 2, 0.6, 10, 40, Math.PI), arcMat);
    bar.position.copy(f0.pos).addScaledVector(f0.N, 6);
    this._orient(bar, f0);
    this.group.add(bar);
    const banner = textSprite('META', { color: '#ffd23f' });
    banner.position.copy(f0.pos).addScaledVector(f0.N, 17);
    this.group.add(banner);
  }

  // ── cajas de objetos: gema dorada amistosa con haz de luz (= BUENO) ──
  _buildItemBoxes() {
    const tr = this.track;
    const shellGeo = new THREE.OctahedronGeometry(1.55, 0);
    const coreGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const ringGeo = new THREE.TorusGeometry(1.65, 0.13, 10, 30);

    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.32, roughness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2b53c, roughness: 0.9, metalness: 0,
      emissive: 0x6b4a08, emissiveIntensity: 0.35,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x46d5ff, roughness: 0.9, metalness: 0,
      emissive: 0x1a7ca0, emissiveIntensity: 0.55, flatShading: true,
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(0.65, 1.5, 13, 12, 1, true);

    const sides = tr.nonOrientable ? [1, -1] : [1];
    for (const def of (tr.def.itemBoxes ?? [])) {
      for (const sd of sides) {
        const f = this._frame(def.s, def.q, 0);
        const up = f.N.clone().multiplyScalar(sd);
        const basePos = f.pos.clone().addScaledVector(up, 2.2);

        const group = new THREE.Group();
        group.position.copy(basePos);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

        const shell = new THREE.Mesh(shellGeo, shellMat);
        const core = new THREE.Mesh(coreGeo, coreMat);
        const ring = new THREE.Mesh(ringGeo, goldMat);
        ring.rotation.x = Math.PI / 2;
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 5.2;
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const symbol = new THREE.Sprite(new THREE.SpriteMaterial({
          map: symbolTexture(sym, '#fff3c0'), transparent: true, depthWrite: false,
        }));
        symbol.scale.set(1.6, 1.6, 1);
        symbol.position.y = 0.1;
        group.add(shell, core, ring, beam, symbol);
        this.group.add(group);
        this.itemBoxes.push({
          mesh: group, shell, core, ring, glow: beam, symbol,
          basePos, pos: basePos, up, cooldown: 0, phase: Math.random() * 7,
        });
      }
    }
  }

  _buildBoostPads() {
    const tr = this.track;
    const tex = boostTexture(0xffd23f);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, toneMapped: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.PlaneGeometry(6, 9);
    const sides = tr.nonOrientable ? [1, -1] : [1];
    for (const def of (tr.def.boostPads ?? [])) {
      for (const sd of sides) {
        const f = this._frame(def.s, def.q, 0);
        const up = f.N.clone().multiplyScalar(sd);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(f.pos).addScaledVector(up, 0.66);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
          f.B.clone().multiplyScalar(sd), f.T, up));
        mesh.rotateX(-Math.PI / 2);
        this.group.add(mesh);
        this.boostPads.push({ mesh, pos: mesh.position.clone(), up });
      }
    }
    this.animated.push(t => { mat.opacity = 0.7 + 0.3 * Math.sin(t * 5); });
  }

  // ── aros luminosos que atraviesas ──────────────────────────────────
  _buildRings() {
    const tr = this.track;
    const theme = tr.def.theme;
    for (const [i, sFrac] of (tr.def.rings ?? []).entries()) {
      const f = this._frame(sFrac, 0, 0);
      const R = (tr.isSurface ? tr.bandHalf + 7 : tr.widthAt(f.s) + 6);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R, 1.15, 12, 48),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? theme.edge2 : theme.edge, toneMapped: false,
          transparent: true, opacity: 0.85,
        }));
      ring.position.copy(f.pos).addScaledVector(f.N, R * 0.55);
      this._orient(ring, f);
      this.group.add(ring);

      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(R - 2.4, 0.5, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.5 }));
      inner.position.copy(ring.position);
      inner.quaternion.copy(ring.quaternion);
      this.group.add(inner);
      this.animated.push((t, dt) => {
        inner.rotation.z += dt * 1.2;
        ring.material.opacity = 0.7 + 0.25 * Math.sin(t * 2.5 + i * 2);
      });
    }
  }

  // ── túneles de arcos (solo cintas) ─────────────────────────────────
  _buildTunnels() {
    const tr = this.track;
    if (tr.isSurface) return;
    const theme = tr.def.theme;
    const archMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.road).multiplyScalar(0.7), roughness: 0.5,
      emissive: theme.edge, emissiveIntensity: 0.12,
    });
    const stripMat = new THREE.MeshBasicMaterial({ color: theme.edge, toneMapped: false, transparent: true, opacity: 0.8 });
    for (const tun of (tr.def.tunnels ?? [])) {
      const s0 = tun.s * tr.length - tun.len / 2;
      for (let d = 0; d <= tun.len; d += 4.5) {
        const f = this._frame(((s0 + d) / tr.length) % 1, 0, 0);
        const w = tr.widthAt(f.s);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(w + 3.2, 1.0, 8, 26, Math.PI), archMat);
        arch.position.copy(f.pos);
        this._orient(arch, f);
        this.group.add(arch);
        if (d % 9 < 4.5) {
          const strip = new THREE.Mesh(new THREE.TorusGeometry(w + 2.4, 0.18, 6, 26, Math.PI), stripMat);
          strip.position.copy(f.pos);
          strip.quaternion.copy(arch.quaternion);
          this.group.add(strip);
        }
      }
      // portales de entrada/salida
      for (const end of [s0 - 3, s0 + tun.len + 3]) {
        const f = this._frame(((end + tr.length) % tr.length) / tr.length, 0, 0);
        const w = tr.widthAt(f.s);
        const gate = new THREE.Mesh(
          new THREE.TorusGeometry(w + 3.6, 0.5, 8, 30, Math.PI),
          new THREE.MeshBasicMaterial({ color: theme.edge2, toneMapped: false }));
        gate.position.copy(f.pos);
        this._orient(gate, f);
        this.group.add(gate);
      }
    }
  }

  // ── obstáculos geométricos ─────────────────────────────────────────
  _buildObstacles() {
    if (CLEAN_RUN) return;            // trailer: vueltas limpias sin trompos
    const tr = this.track;
    const theme = tr.def.theme;
    for (const def of (tr.def.obstacles ?? [])) {
      const f = this._frame(def.s, def.q, 0);
      if (def.type === 'spinner') this._makeSpinner(f, theme);
      else if (def.type === 'bumper') this._makeBumper(f, theme);
      else this._makeCone(f, theme);
    }
  }

  /** anillo rojo pulsante en el suelo: zona de peligro */
  _dangerRing(f, radius) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.7, radius, 36),
      new THREE.MeshBasicMaterial({
        color: 0xe8362e, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      }));
    ring.position.copy(f.pos).addScaledVector(f.N, 0.15 + this.roadLift);
    this._orient(ring, f);
    ring.rotateX(-Math.PI / 2);
    this.group.add(ring);
    const ph = Math.random() * 7;
    this.animated.push(t => { ring.material.opacity = 0.32 + 0.25 * Math.sin(t * 4 + ph); });
  }

  _makeSpinner(f, theme) {
    const group = new THREE.Group();
    group.position.copy(f.pos).addScaledVector(f.N, 1.1 + this.roadLift);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.B.clone().negate(), f.N, f.T));
    this._dangerRing(f, 5.2);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.0, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x23232f, roughness: 0.9, metalness: 0 }));
    const hazard = hazardTexture();
    hazard.repeat.set(4, 1);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.62, 0.62),
      new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.5 }));
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xe8362e, roughness: 0.3, emissive: 0xa01010, emissiveIntensity: 0.8,
    });
    const tips = [-1, 1].map(sd => {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 8), tipMat);
      tip.rotation.z = sd > 0 ? -Math.PI / 2 : Math.PI / 2;
      tip.position.x = sd * 4.9;
      bar.add(tip);
      return tip;
    });
    group.add(hub, bar);
    this.group.add(group);

    const phase = Math.random() * 7;
    const speed = 1.7;
    const colliders = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const ob = {
      type: 'spinner', radius: 1.7, colliders,
      tick: (t) => {
        const phi = t * speed + phase;
        bar.rotation.y = phi;
        // dir mundo del brazo: B·cosφ − T·sinφ
        const dx = Math.cos(phi), dz = -Math.sin(phi);
        for (const [k, dist] of [[0, 0], [1, 3.4], [2, -3.4]].values()) {
          colliders[k].copy(group.position)
            .addScaledVector(f.B, dx * dist)
            .addScaledVector(f.T, dz * dist);
        }
        void tips;
      },
    };
    ob.tick(0);
    this.obstacles.push(ob);
  }

  _makeBumper(f, theme) {
    this._dangerRing(f, 3.4);
    // erizo: octaedro oscuro con pinchos rojos
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a2a36, roughness: 0.9, metalness: 0 }));
    mesh.add(body);
    const spikeGeo = new THREE.ConeGeometry(0.28, 1.1, 7);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xe8362e, roughness: 0.3, emissive: 0x900d0d, emissiveIntensity: 0.8,
    });
    for (let k = 0; k < 10; k++) {
      const dir = new THREE.Vector3().randomDirection();
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.copy(dir).multiplyScalar(1.45);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.add(spike);
    }
    const base = f.pos.clone().addScaledVector(f.N, 2.0 + this.roadLift);
    mesh.position.copy(base);
    this.group.add(mesh);
    const collider = base.clone();
    const phase = Math.random() * 7;
    this.obstacles.push({
      type: 'bumper', radius: 2.4, colliders: [collider],
      tick: (t) => {
        const bob = Math.abs(Math.sin(t * 2.4 + phase)) * 1.4;
        mesh.position.copy(base).addScaledVector(f.N, bob);
        mesh.rotation.y = t * 1.5;
        mesh.scale.setScalar(1 + 0.1 * Math.sin(t * 4.8 + phase));
        collider.copy(mesh.position);
      },
    });
  }

  _makeCone(f, theme) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 2.4, 14),
      new THREE.MeshStandardMaterial({ map: coneStripesTexture(), roughness: 0.45 }));
    mesh.position.copy(f.pos).addScaledVector(f.N, 1.25 + this.roadLift);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.N);
    mesh.castShadow = true;
    this.group.add(mesh);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.45, 0.16, 14),
      new THREE.MeshStandardMaterial({ color: 0xe8362e, roughness: 0.5 }));
    base.position.copy(f.pos).addScaledVector(f.N, 0.12 + this.roadLift);
    base.quaternion.copy(mesh.quaternion);
    this.group.add(base);
    this.obstacles.push({ type: 'cone', radius: 1.5, colliders: [mesh.position.clone()] });
  }

  // ── fórmulas flotantes ─────────────────────────────────────────────
  _buildFormulas() {
    const tr = this.track;
    const formulas = tr.def.formulas ?? [];
    const colorHex = '#' + tr.def.theme.edge.toString(16).padStart(6, '0');
    for (const [i, text] of formulas.entries()) {
      const sp = formulaSprite(text, i % 2 ? colorHex : '#cfd8ff');
      const f = this._frame((i + 0.55) / formulas.length % 1, 0, 0);
      const side = i % 2 ? 1 : -1;
      const base = f.pos.clone()
        .addScaledVector(f.B, side * ((tr.isSurface ? tr.bandHalf : tr.widthAt(f.s)) + 24))
        .addScaledVector(f.N, 16 + (i % 3) * 7);
      sp.position.copy(base);
      this.group.add(sp);
      this.animated.push(t => {
        sp.position.copy(base).addScaledVector(f.N, Math.sin(t * 0.7 + i * 2) * 1.6);
      });
    }
  }

  // ── motas brillantes alrededor de la pista ─────────────────────────
  _buildSparkles() {
    const tr = this.track;
    const N = 360;
    const pos = new Float32Array(N * 3);
    const tmp = new THREE.Vector3();
    const fr = {};
    for (let i = 0; i < N; i++) {
      const s = Math.random() * tr.length;
      const lateral = (Math.random() - 0.5) * 90;
      const h = 4 + Math.random() * 42;
      tr.surfaceFrame(s, 0, 0, fr);
      tmp.copy(fr.pos).addScaledVector(fr.B, lateral).addScaledVector(fr.N, h);
      pos.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture('#bfe9ff'), color: 0xbfe9ff, size: 1.4, transparent: true,
      opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.animated.push(t => { mat.opacity = 0.32 + 0.2 * Math.sin(t * 1.8); });
  }

  // ── decorado por circuito ──────────────────────────────────────────
  _buildDecor() {
    const kind = this.track.def.theme.decor;
    if (kind === 'sphere') this._decorSphere();
    else if (kind === 'mobius') this._decorMobius();
    else if (kind === 'torus') this._decorTorus();
    else if (kind === 'double') this._decorDouble();
    else if (kind === 'hyper') this._decorHyper();
  }

  _decorSphere() {
    const R = this.track.R;
    // anillos orbitales tipo planeta
    for (const [i, tilt] of [[0, 0.45], [1, -0.3]].entries()) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R + 26 + i * 9, 0.9, 10, 80),
        new THREE.MeshStandardMaterial({
          color: i ? 0xffd23f : 0x46d5ff, roughness: 0.4,
          emissive: i ? 0xffd23f : 0x46d5ff, emissiveIntensity: 0.25,
          transparent: true, opacity: 0.8,
        }));
      ring.rotation.x = Math.PI / 2 + tilt;
      this.group.add(ring);
      this.animated.push((t, dt) => { ring.rotation.z += dt * 0.05 * (i ? -1 : 1); });
    }
    // lunas orbitando
    const moons = new THREE.Group();
    const moonGeos = [new THREE.IcosahedronGeometry(4), new THREE.DodecahedronGeometry(3), new THREE.OctahedronGeometry(3.4)];
    for (let i = 0; i < 3; i++) {
      const moon = new THREE.Mesh(moonGeos[i], new THREE.MeshStandardMaterial({
        color: [0xff5d8f, 0xbfe9ff, 0xffd23f][i], roughness: 0.5, flatShading: true,
      }));
      moon.userData = { r: R + 48 + i * 22, sp: 0.10 + i * 0.04, ph: i * 2.1, tilt: i * 0.7 };
      moons.add(moon);
    }
    this.group.add(moons);
    this.animated.push(t => {
      for (const moon of moons.children) {
        const { r, sp, ph, tilt } = moon.userData;
        const a = t * sp + ph;
        moon.position.set(r * Math.cos(a), r * 0.35 * Math.sin(a + tilt), r * Math.sin(a));
        moon.rotation.y = t * 0.6;
      }
    });
    // planetas pastel lejanos
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(26 + i * 14, 24, 18),
        new THREE.MeshStandardMaterial({ color: [0x7c6bff, 0xff9a3c, 0x4ade80][i], roughness: 0.8 }));
      const a = i * 2.3 + 0.8;
      p.position.set(560 * Math.cos(a), 120 + i * 90, 560 * Math.sin(a));
      this.group.add(p);
    }
  }

  _decorMobius() {
    const geos = [
      new THREE.IcosahedronGeometry(10), new THREE.TorusKnotGeometry(8, 2.4, 60, 10),
      new THREE.OctahedronGeometry(11), new THREE.TorusGeometry(10, 3, 10, 24),
      new THREE.DodecahedronGeometry(9), new THREE.TetrahedronGeometry(12),
    ];
    // sólidos opacos con caras planas: nada de wireframes finos
    const mat = new THREE.MeshStandardMaterial({ color: 0x6fa8e0, roughness: 0.95, metalness: 0, flatShading: true });
    const solid = new THREE.MeshStandardMaterial({ color: 0x46d5ff, roughness: 0.95, metalness: 0, flatShading: true });
    const group = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], i % 3 === 2 ? solid : mat);
      const a = (i / 22) * Math.PI * 2;
      const r = 190 + (i % 4) * 65;
      m.position.set(r * Math.cos(a), -70 + (i % 5) * 48, r * Math.sin(a));
      m.userData.spin = 0.1 + (i % 4) * 0.05;
      group.add(m);
    }
    this.group.add(group);
    this.animated.push((t, dt) => {
      for (const m of group.children) { m.rotation.y += m.userData.spin * dt; m.rotation.x += m.userData.spin * 0.6 * dt; }
    });
  }

  _decorTorus() {
    const { R, r } = this.track;
    // anillos de neón alrededor del tubo, como una estación circular
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 8, 0.4, 8, 48), ringMat);
      ring.position.set(R * Math.cos(a), 0, R * Math.sin(a));
      ring.rotation.y = -a + Math.PI / 2;
      this.group.add(ring);
    }
    this.animated.push(t => { ringMat.opacity = 0.35 + 0.2 * Math.sin(t * 2.2); });
    // satélites poliédricos sólidos
    const mat = new THREE.MeshStandardMaterial({ color: 0xc09aff, roughness: 0.95, metalness: 0, flatShading: true });
    const group = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(i % 2 ? new THREE.TorusGeometry(9, 3, 8, 22) : new THREE.IcosahedronGeometry(9), mat);
      const a = (i / 12) * Math.PI * 2 + 0.3;
      m.position.set(230 * Math.cos(a), -50 + (i % 4) * 40, 230 * Math.sin(a));
      m.userData.spin = 0.12 + (i % 3) * 0.06;
      group.add(m);
    }
    this.group.add(group);
    this.animated.push((t, dt) => {
      for (const m of group.children) { m.rotation.y += m.userData.spin * dt; m.rotation.z += m.userData.spin * 0.5 * dt; }
    });
  }

  _decorDouble() {
    const colors = [0xff5d8f, 0x4ade80];
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 85 : -85;
      // radio contenido en el lóbulo para no invadir la pista ensanchada
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(32, 4, 14, 50),
        new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4, emissive: colors[i], emissiveIntensity: 0.35 }));
      wheel.position.set(x, 14, 0);
      this.group.add(wheel);
      const cabMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.5 });
      const cabins = new THREE.Group();
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const cab = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), cabMat);
        cab.position.set(32 * Math.cos(a), 32 * Math.sin(a), 0);
        cabins.add(cab);
      }
      cabins.position.copy(wheel.position);
      this.group.add(cabins);
      this.animated.push((t) => { cabins.rotation.z = t * 0.15 * (i ? -1 : 1); wheel.rotation.z = t * 0.15 * (i ? -1 : 1); });

      const sign = textSprite(`AGUJERO ${i + 1}`, { color: i ? '#4ade80' : '#ff5d8f' });
      sign.position.set(x, 60, 0);
      this.group.add(sign);
    }
    // globos de feria flotando
    const balloons = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(4 + (i % 3), 14, 12),
        new THREE.MeshStandardMaterial({ color: [0xffd23f, 0xff5d8f, 0x46d5ff][i % 3], roughness: 0.3 }));
      const a = (i / 10) * Math.PI * 2;
      b.position.set(240 * Math.cos(a), 30 + (i % 4) * 26, 200 * Math.sin(a));
      b.userData.ph = i * 1.7;
      balloons.add(b);
    }
    this.group.add(balloons);
    this.animated.push(t => {
      for (const b of balloons.children) b.position.y += Math.sin(t * 0.8 + b.userData.ph) * 0.015;
    });
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(600, 48),
      new THREE.MeshStandardMaterial({ color: 0x521f05, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -60;
    this.group.add(floor);
  }

  _decorHyper() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(260, 96),
      new THREE.MeshBasicMaterial({ map: poincareDiscTexture(), toneMapped: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -26;
    this.group.add(disc);

    const arcMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, toneMapped: false, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 110 + (i % 3) * 55;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(34 + (i % 4) * 16, 0.6, 8, 40, Math.PI), arcMat);
      arc.position.set(r * Math.cos(a), -26, r * Math.sin(a));
      arc.rotation.y = a + Math.PI / 2;
      this.group.add(arc);
    }
    this.animated.push(t => { arcMat.opacity = 0.35 + 0.2 * Math.sin(t * 1.7); });

    // triángulos hiperbólicos flotantes sólidos
    const triMat = new THREE.MeshStandardMaterial({ color: 0x2fbf9e, roughness: 0.95, metalness: 0, flatShading: true });
    const tris = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(6 + (i % 3) * 3), triMat);
      const a = (i / 12) * Math.PI * 2 + 1;
      m.position.set(200 * Math.cos(a), 20 + (i % 5) * 18, 200 * Math.sin(a));
      m.userData.spin = 0.15 + (i % 3) * 0.07;
      tris.add(m);
    }
    this.group.add(tris);
    this.animated.push((t, dt) => {
      for (const m of tris.children) { m.rotation.x += m.userData.spin * dt; m.rotation.y += m.userData.spin * 0.7 * dt; }
    });
  }

  // ════ espectáculo común: hipercubo, Lorenz, fuente, nubes y público ════
  _buildSpectacle() {
    const tr = this.track;
    const off = (tr.isSurface ? tr.bandHalf : tr.halfWidth) + 30;
    this._tesseract(this._spot(0.30, off + 25, 34));
    this._fountain(this._spot(0.965, -(off + 16), 0));
    this._geoClouds();
    this._grandstand(this._spot(0.085, off + 9, 0), 0.085);
    this._grandstand(this._spot(0.52, -(off + 9), 0), 0.52);
  }

  /** punto de anclaje flotando junto a la pista */
  _spot(sFrac, lateral, height) {
    const f = this._frame(sFrac, 0, 0);
    return {
      pos: f.pos.clone().addScaledVector(f.B, lateral).addScaledVector(f.N, height),
      f,
      side: Math.sign(lateral),
    };
  }

  /** hipercubo (teseracto) en rotación 4D proyectado a 3D */
  _tesseract(spot) {
    const SIZE = 9, D = 3;
    const verts4 = [];
    for (let i = 0; i < 16; i++) {
      verts4.push([(i & 1) * 2 - 1, ((i >> 1) & 1) * 2 - 1, ((i >> 2) & 1) * 2 - 1, ((i >> 3) & 1) * 2 - 1]);
    }
    const edges = [];
    for (let i = 0; i < 16; i++)
      for (let j = i + 1; j < 16; j++) {
        let diff = 0;
        for (let k = 0; k < 4; k++) if (verts4[i][k] !== verts4[j][k]) diff++;
        if (diff === 1) edges.push([i, j]);
      }
    // aristas como barras sólidas con grosor (cilindros instanciados)
    const bars = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x7cc8ff, roughness: 0.9, metalness: 0, emissive: 0x1a3a55, emissiveIntensity: 0.5 }),
      edges.length);
    bars.position.copy(spot.pos);
    this.group.add(bars);
    const nodes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.85, metalness: 0, emissive: 0x806010, emissiveIntensity: 0.5 }),
      16);
    nodes.position.copy(spot.pos);
    this.group.add(nodes);

    const proj = new Array(16).fill().map(() => new THREE.Vector3());
    const m4 = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(), mid = new THREE.Vector3();
    const quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    this.animated.push(t => {
      const a = t * 0.5, b = t * 0.33;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      for (let i = 0; i < 16; i++) {
        const [x, y, z, w] = verts4[i];
        // rotación en los planos XW e YZ
        const x2 = x * ca - w * sa, w2 = x * sa + w * ca;
        const y2 = y * cb - z * sb, z2 = y * sb + z * cb;
        const k = SIZE * (D / (D - w2 * 0.8));
        proj[i].set(x2 * k, y2 * k, z2 * k);
        m4.makeTranslation(proj[i].x, proj[i].y, proj[i].z);
        nodes.setMatrixAt(i, m4);
      }
      nodes.instanceMatrix.needsUpdate = true;
      for (const [e, [i, j]] of edges.entries()) {
        dir.subVectors(proj[j], proj[i]);
        const len = dir.length();
        mid.addVectors(proj[i], proj[j]).multiplyScalar(0.5);
        quat.setFromUnitVectors(up, dir.normalize());
        scl.set(1, len, 1);
        m4.compose(mid, quat, scl);
        bars.setMatrixAt(e, m4);
      }
      bars.instanceMatrix.needsUpdate = true;
    });
  }

  /** fuente de sólidos platónicos que se transforman al renacer */
  _fountain(spot) {
    const f = spot.f;
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.2, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xcfd4e8, roughness: 0.95, metalness: 0 }));
    pedestal.position.copy(spot.pos).addScaledVector(f.N, 1.2);
    pedestal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.N);
    this.group.add(pedestal);

    const GEOS = [
      new THREE.TetrahedronGeometry(1.6), new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.OctahedronGeometry(1.7), new THREE.DodecahedronGeometry(1.6),
      new THREE.IcosahedronGeometry(1.6),
    ];
    const COLS = [0xef4444, 0x3b82f6, 0xeab308, 0xd4a017, 0x4ade80];
    const drops = [];
    for (let k = 0; k < 9; k++) {
      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.95, metalness: 0, flatShading: true, color: COLS[k % 5],
      });
      const mesh = new THREE.Mesh(GEOS[k % 5], mat);
      this.group.add(mesh);
      drops.push({
        mesh, gi: k % 5,
        life: (k / 9) * 3.6, ang: (k / 9) * Math.PI * 2,
        rad: 2 + (k % 3) * 1.6, spin: 1 + (k % 4) * 0.5,
      });
    }
    this.animated.push((t, dt) => {
      for (const d of drops) {
        d.life += dt;
        if (d.life > 3.6) {
          d.life = 0;
          d.gi = (d.gi + 1) % 5; // ¡se transforma en el siguiente sólido!
          d.mesh.geometry = GEOS[d.gi];
          d.mesh.material.color.set(COLS[d.gi]);
          d.ang = Math.random() * Math.PI * 2;
        }
        const u = d.life / 3.6;
        const h = 2.4 + 26 * u * (1 - u) * 1.6; // parábola de fuente
        const r = d.rad + u * 5;
        const local = new THREE.Vector3(Math.cos(d.ang) * r, h, Math.sin(d.ang) * r)
          .applyQuaternion(pedestal.quaternion);
        d.mesh.position.copy(spot.pos).add(local);
        d.mesh.rotation.set(t * d.spin, t * d.spin * 0.7, 0);
        const sc = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5);
        d.mesh.scale.setScalar(Math.max(0.01, sc));
      }
    });
  }

  /** nubes geométricas: racimos de cubos redondeados pastel */
  _geoClouds() {
    const tr = this.track;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf6f8ff, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const s = 5 + Math.random() * 7;
        const box = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s * 0.8, s), mat);
        box.position.set(k * 6 - n * 3 + Math.random() * 3, Math.random() * 3, Math.random() * 4 - 2);
        box.rotation.y = Math.random() * 0.6;
        cloud.add(box);
      }
      const f = this._frame((i / 7 + 0.05) % 1, 0, 0);
      const base = f.pos.clone()
        .addScaledVector(f.B, (i % 2 ? 1 : -1) * (70 + (i % 3) * 45))
        .addScaledVector(f.N, 45 + (i % 4) * 18);
      cloud.position.copy(base);
      this.group.add(cloud);
      this.animated.push(t => {
        cloud.position.copy(base).addScaledVector(f.T, Math.sin(t * 0.05 + i * 2) * 14);
      });
    }
  }

  /** grada con público geométrico que salta la ola */
  _grandstand(spot, sFrac) {
    const f = spot.f;
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.B.clone().negate(), f.N, f.T));

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4.5, 18),
      new THREE.MeshStandardMaterial({ color: 0x8d93b8, roughness: 0.6 }));
    stand.position.copy(spot.pos).addScaledVector(f.N, 2.25).addScaledVector(f.B, spot.side * 4);
    stand.quaternion.copy(q);
    this.group.add(stand);
    // escalones
    for (let r = 0; r < 3; r++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.6, 18),
        new THREE.MeshStandardMaterial({ color: 0xb9bfdd, roughness: 0.55 }));
      step.position.copy(spot.pos)
        .addScaledVector(f.N, 4.8 + r * 1.5)
        .addScaledVector(f.B, spot.side * (1.5 + r * 2.4));
      step.quaternion.copy(q);
      this.group.add(step);
    }

    // espectadores: poliedros con colores vivos que hacen la ola
    const COLS = [0xef4444, 0x3b82f6, 0xeab308, 0x4ade80, 0xf97316, 0x8b5cf6];
    const crowd = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.62, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.4 }),
      36);
    const colC = new THREE.Color();
    for (let i = 0; i < 36; i++) crowd.setColorAt(i, colC.setHex(COLS[i % 6]));
    this.group.add(crowd);

    const m = new THREE.Matrix4();
    const qm = new THREE.Quaternion();
    this.animated.push(t => {
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 12; k++) {
          const i = row * 12 + k;
          const jump = Math.max(0, Math.sin(t * 3 - k * 0.55 - row * 0.4)) * 0.9;
          const p = spot.pos.clone()
            .addScaledVector(f.N, 5.6 + row * 1.5 + jump)
            .addScaledVector(f.B, spot.side * (1.5 + row * 2.4))
            .addScaledVector(f.T, (k - 5.5) * 1.45);
          qm.copy(q);
          m.compose(p, qm, new THREE.Vector3(1, 1, 1));
          crowd.setMatrixAt(i, m);
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
    });
  }
}
