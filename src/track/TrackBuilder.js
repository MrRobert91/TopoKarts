import * as THREE from 'three';
import {
  roadTexture, finishTexture, symbolTexture, boostTexture,
  poincareDiscTexture, textSprite, surfaceTexture, formulaSprite, glowTexture,
} from './textures.js';

const SYMBOLS = ['∞', 'χ', 'π', '⇄', '◯', '⬠', '△'];

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
        box.shell.rotation.y = t * 1.6 + box.phase;
        box.shell.rotation.x = t * 0.9 + box.phase;
        box.core.rotation.y = -t * 2.2;
        box.core.rotation.z = t * 1.3;
        const bob = Math.sin(t * 2.2 + box.phase) * 0.35;
        box.mesh.position.copy(box.basePos).addScaledVector(box.up, bob);
        box.glow.material.opacity = 0.30 + 0.14 * Math.sin(t * 3.5 + box.phase);
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
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.B, fr.N, fr.T));
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
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 16), mat));

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
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
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
    const thick = 1.1;

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture(theme), roughness: 0.55, metalness: 0.05,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.edge2).multiplyScalar(0.5), roughness: 0.7,
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
          uvs.push(side, i / nSeg * (nSeg / 10));
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
      this.group.add(mesh);
      return mesh;
    };

    for (const surf of [{ y: thick / 2, flip: false }, { y: -thick / 2, flip: true }]) {
      ribbon((side, w) => (side ? w : -w), () => surf.y, roadMat, surf.flip);
    }
    ribbon((side, w) => -w, (side) => side ? thick / 2 : -thick / 2, sideMat, true);
    ribbon((side, w) => w, (side) => side ? thick / 2 : -thick / 2, sideMat, false);
    for (const y of [thick / 2 + 0.04, -thick / 2 - 0.04]) {
      ribbon((side, w) => -w + (side ? 0.9 : 0), () => y, glowMat, y < 0);
      ribbon((side, w) => w - (side ? 0 : 0.9), () => y, glowMat2, y < 0);
    }

    this._buildPosts();
  }

  /** postes-baliza con luz a lo largo de los bordes (instanciados) */
  _buildPosts() {
    const tr = this.track;
    const theme = tr.def.theme;
    const step = 9;
    const count = Math.floor(tr.length / step) * 2;
    const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.6, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f4, roughness: 0.4 });
    const orbGeo = new THREE.SphereGeometry(0.34, 8, 8);
    const orbMat = new THREE.MeshBasicMaterial({ color: theme.edge, toneMapped: false });
    const orbMat2 = new THREE.MeshBasicMaterial({ color: theme.edge2, toneMapped: false });

    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    const orbsA = new THREE.InstancedMesh(orbGeo, orbMat, Math.ceil(count / 2));
    const orbsB = new THREE.InstancedMesh(orbGeo, orbMat2, Math.floor(count / 2));
    const m = new THREE.Matrix4();
    const fr = {};
    let iPost = 0, iA = 0, iB = 0;
    for (let i = 0; i < count / 2; i++) {
      const s = i * step;
      tr.frameAt(s, 0, fr);
      const w = tr.widthAt(s);
      for (const side of [-1, 1]) {
        const base = fr.pos.clone().addScaledVector(fr.B, side * (w + 1.1)).addScaledVector(fr.N, 0.8);
        m.makeBasis(fr.B, fr.N, fr.T).setPosition(base);
        posts.setMatrixAt(iPost++, m);
        const orbPos = base.clone().addScaledVector(fr.N, 1.0);
        m.makeBasis(fr.B, fr.N, fr.T).setPosition(orbPos);
        if (side < 0) orbsA.setMatrixAt(iA++, m);
        else orbsB.setMatrixAt(iB++, m);
      }
    }
    orbsA.count = iA; orbsB.count = iB;
    this.group.add(posts, orbsA, orbsB);
  }

  _buildFinish() {
    const tr = this.track;
    const w = tr.isSurface ? tr.bandHalf + 1 : tr.widthAt(0);
    const geo = new THREE.PlaneGeometry(w * 2, 4);
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
        f1.B.clone().negate(), f1.N.clone().negate(), f1.T));
      m2.rotateX(-Math.PI / 2);
      this.group.add(m2);
    }

    // arco de meta con neón
    const theme = tr.def.theme;
    const arcMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x222244 });
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

  // ── cajas de objetos: núcleo prismático + jaula luminosa + halo ────
  _buildItemBoxes() {
    const tr = this.track;
    const theme = tr.def.theme;
    const shellGeo = new THREE.OctahedronGeometry(1.7, 0);
    const coreGeo = new THREE.IcosahedronGeometry(0.95, 0);

    const sides = tr.nonOrientable ? [1, -1] : [1];
    for (const def of (tr.def.itemBoxes ?? [])) {
      for (const sd of sides) {
        const f = this._frame(def.s, def.q, 0);
        const up = f.N.clone().multiplyScalar(sd);
        const basePos = f.pos.clone().addScaledVector(up, 2.2);

        const group = new THREE.Group();
        group.position.copy(basePos);

        const shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({
          color: theme.edge, wireframe: true, transparent: true, opacity: 0.9, toneMapped: false,
        }));
        const core = new THREE.Mesh(coreGeo, new THREE.MeshNormalMaterial({ flatShading: true }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture('#9fd8ff'), transparent: true, opacity: 0.35,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        glow.scale.setScalar(7);
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const symbol = new THREE.Sprite(new THREE.SpriteMaterial({
          map: symbolTexture(sym), transparent: true, depthWrite: false,
        }));
        symbol.scale.set(1.7, 1.7, 1);
        symbol.position.copy(up).multiplyScalar(0.2);
        group.add(glow, shell, core, symbol);
        this.group.add(group);
        this.itemBoxes.push({
          mesh: group, shell, core, glow, symbol,
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
        new THREE.TorusGeometry(R, 0.55, 10, 48),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? theme.edge2 : theme.edge, toneMapped: false,
          transparent: true, opacity: 0.85,
        }));
      ring.position.copy(f.pos).addScaledVector(f.N, R * 0.55);
      this._orient(ring, f);
      this.group.add(ring);

      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(R - 1.6, 0.22, 8, 40),
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
    const tr = this.track;
    const theme = tr.def.theme;
    for (const def of (tr.def.obstacles ?? [])) {
      const f = this._frame(def.s, def.q, 0);
      if (def.type === 'spinner') this._makeSpinner(f, theme);
      else if (def.type === 'bumper') this._makeBumper(f, theme);
      else this._makeCone(f, theme);
    }
  }

  _makeSpinner(f, theme) {
    const group = new THREE.Group();
    group.position.copy(f.pos).addScaledVector(f.N, 1.1);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.B, f.N, f.T));

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.0, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a45, roughness: 0.4, metalness: 0.5 }));
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xff5d5d, roughness: 0.35, emissive: 0x661111 }));
    const tips = [-1, 1].map(sd => {
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.8),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }));
      tip.position.x = sd * 4.3;
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
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.8, 0),
      new THREE.MeshStandardMaterial({
        color: theme.edge2, roughness: 0.25, emissive: theme.edge2, emissiveIntensity: 0.4,
      }));
    const base = f.pos.clone().addScaledVector(f.N, 2.0);
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
      new THREE.ConeGeometry(1.0, 2.4, 5),
      new THREE.MeshStandardMaterial({
        color: 0xff9a3c, roughness: 0.5, emissive: 0x803300, emissiveIntensity: 0.3,
      }));
    mesh.position.copy(f.pos).addScaledVector(f.N, 1.25);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.N);
    this.group.add(mesh);
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
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, wireframe: true, transparent: true, opacity: 0.35 });
    const solid = new THREE.MeshStandardMaterial({ color: 0x46d5ff, roughness: 0.3, transparent: true, opacity: 0.18 });
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
    // satélites poliédricos
    const mat = new THREE.MeshBasicMaterial({ color: 0xc09aff, wireframe: true, transparent: true, opacity: 0.35 });
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
      const x = i === 0 ? 95 : -95;
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(42, 5, 14, 50),
        new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4, emissive: colors[i], emissiveIntensity: 0.35 }));
      wheel.position.set(x, 14, 0);
      this.group.add(wheel);
      const cabMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.5 });
      const cabins = new THREE.Group();
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const cab = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 10), cabMat);
        cab.position.set(42 * Math.cos(a), 42 * Math.sin(a), 0);
        cabins.add(cab);
      }
      cabins.position.copy(wheel.position);
      this.group.add(cabins);
      this.animated.push((t) => { cabins.rotation.z = t * 0.15 * (i ? -1 : 1); wheel.rotation.z = t * 0.15 * (i ? -1 : 1); });

      const sign = textSprite(`AGUJERO ${i + 1}`, { color: i ? '#4ade80' : '#ff5d8f' });
      sign.position.set(x, 72, 0);
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

    // triángulos hiperbólicos flotantes
    const triMat = new THREE.MeshBasicMaterial({ color: 0x7dffea, wireframe: true, transparent: true, opacity: 0.4 });
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
}
