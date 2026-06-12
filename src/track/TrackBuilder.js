import * as THREE from 'three';
import { roadTexture, finishTexture, symbolTexture, boostTexture, poincareDiscTexture, textSprite } from './textures.js';

const SYMBOLS = ['∞', 'χ', 'π', '⇄', '◯', '⬠', '△'];

/**
 * Construye toda la escena visual de un circuito: carretera, bordes
 * luminosos, meta, cajas de objetos, turbos, decorado y cielo.
 */
export class TrackScene {
  constructor(track) {
    this.track = track;
    this.group = new THREE.Group();
    this.animated = []; // callbacks (t, dt)
    this.itemBoxes = [];
    this.boostPads = [];
    this.portalGates = [];

    this._buildSky();
    this._buildRoad();
    this._buildFinish();
    this._buildItemBoxes();
    this._buildBoostPads();
    this._buildDecor();
  }

  update(t, dt) {
    for (const fn of this.animated) fn(t, dt);
    for (const box of this.itemBoxes) {
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        const vis = box.cooldown <= 0;
        if (vis !== box.mesh.visible) box.mesh.visible = vis;
      }
      if (box.mesh.visible) {
        box.mesh.rotation.y = t * 1.4 + box.phase;
        box.mesh.rotation.x = Math.sin(t * 0.9 + box.phase) * 0.35;
        box.symbol.material.rotation = -t * 0.8;
      }
    }
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
          vec3 c = mix(bottom, top, smoothstep(0.15, 0.85, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 16), mat);
    this.group.add(sky);

    // estrellas
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1400 + Math.random() * 600);
      pos.set([v.x, Math.abs(v.y) * (Math.random() > 0.3 ? 1 : -0.4), v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8,
    }));
    this.group.add(stars);
    this.animated.push(t => { stars.rotation.y = t * 0.004; });
  }

  // ── carretera ──────────────────────────────────────────────────────
  _buildRoad() {
    const tr = this.track;
    const theme = tr.def.theme;
    const nSeg = Math.max(200, Math.round(tr.length / 1.4));
    const thick = 1.1;

    const surfaces = [
      { y: thick / 2, flipWinding: false },   // cara superior
      { y: -thick / 2, flipWinding: true },   // cara inferior (en Möbius también se conduce)
    ];

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

    // superficies de conducción (arriba y abajo)
    for (const surf of surfaces) {
      ribbon((side, w) => (side ? w : -w), () => surf.y, roadMat, surf.flipWinding);
    }
    // laterales
    ribbon((side, w) => -w - 0.0, (side) => side ? thick / 2 : -thick / 2, sideMat, true);
    ribbon((side, w) => w + 0.0, (side) => side ? thick / 2 : -thick / 2, sideMat, false);
    // bordes luminosos (cuatro tiras: 2 arriba, 2 abajo)
    for (const y of [thick / 2 + 0.04, -thick / 2 - 0.04]) {
      ribbon((side, w) => -w + (side ? 0.9 : 0), () => y, glowMat, y < 0);
      ribbon((side, w) => w - (side ? 0 : 0.9), () => y, glowMat2, y < 0);
    }
  }

  _buildFinish() {
    const tr = this.track;
    const w = tr.widthAt(0);
    const geo = new THREE.PlaneGeometry(w * 2, 4);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: finishTexture(), toneMapped: false }));
    this._placeOnSurface(mesh, 0, 0, 0.62);
    this.group.add(mesh);
    if (tr.nonOrientable) {
      const m2 = mesh.clone();
      this._placeOnSurface(m2, 0, 0, -0.62, true);
      this.group.add(m2);
    }

    // arco de meta
    const arcMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x222244 });
    const fr = tr.frameAt(0, 0, {});
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 12, 12), arcMat);
      pillar.position.copy(fr.pos).addScaledVector(fr.B, side * (w + 2)).addScaledVector(fr.N, 6);
      pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.N);
      this.group.add(pillar);
    }
    const bar = new THREE.Mesh(new THREE.TorusGeometry(w + 2, 0.6, 10, 40, Math.PI), arcMat);
    bar.position.copy(fr.pos).addScaledVector(fr.N, 6);
    const m = new THREE.Matrix4().makeBasis(fr.B, fr.N, fr.T);
    bar.quaternion.setFromRotationMatrix(m);
    this.group.add(bar);
    const banner = textSprite('META', { color: '#ffd23f' });
    banner.position.copy(fr.pos).addScaledVector(fr.N, 17);
    this.group.add(banner);
  }

  /** orienta un plano sobre la superficie en (s,q), altura h (h<0 = cara inferior) */
  _placeOnSurface(mesh, s, q, h, underside = false) {
    const fr = this.track.frameAt(s, 0, {});
    mesh.position.copy(fr.pos).addScaledVector(fr.B, q).addScaledVector(fr.N, h);
    const up = underside ? fr.N.clone().negate() : fr.N.clone();
    const m = new THREE.Matrix4().makeBasis(fr.B.clone().multiplyScalar(underside ? -1 : 1), fr.T, up);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.rotateX(-Math.PI / 2);
  }

  // ── cajas de objetos ───────────────────────────────────────────────
  _buildItemBoxes() {
    const tr = this.track;
    const boxGeo = new THREE.BoxGeometry(2.3, 2.3, 2.3);
    const boxMat = new THREE.MeshPhysicalMaterial({
      color: 0x88e6ff, transparent: true, opacity: 0.34, roughness: 0.1,
      metalness: 0, transmission: 0, side: THREE.DoubleSide,
      emissive: 0x2266aa, emissiveIntensity: 0.5,
    });

    const sides = tr.nonOrientable ? [1, -1] : [1];
    for (const def of (tr.def.itemBoxes ?? [])) {
      for (const sd of sides) {
        const fr = tr.frameAt(def.s * tr.length, 0, {});
        const up = fr.N.clone().multiplyScalar(sd);
        const pos = fr.pos.clone().addScaledVector(fr.B, def.q).addScaledVector(up, 2.1);

        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.copy(pos);
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const symbol = new THREE.Sprite(new THREE.SpriteMaterial({
          map: symbolTexture(sym), transparent: true, depthWrite: false,
        }));
        symbol.scale.set(1.6, 1.6, 1);
        mesh.add(symbol);
        this.group.add(mesh);
        this.itemBoxes.push({ mesh, symbol, pos, up, cooldown: 0, phase: Math.random() * 7 });
      }
    }
  }

  // ── turbos ─────────────────────────────────────────────────────────
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
        const fr = tr.frameAt(def.s * tr.length, 0, {});
        const up = fr.N.clone().multiplyScalar(sd);
        const mesh = new THREE.Mesh(geo, mat);
        this._placeOnSurface(mesh, def.s * tr.length, def.q, sd * 0.68, sd < 0);
        this.group.add(mesh);
        const pos = fr.pos.clone().addScaledVector(fr.B, def.q).addScaledVector(up, 0.6);
        this.boostPads.push({ mesh, pos, up, s: def.s * tr.length, q: def.q });
        this.animated.push(t => { mat.opacity = 0.75 + 0.25 * Math.sin(t * 5); });
      }
    }
  }

  // ── decorado por circuito ──────────────────────────────────────────
  _buildDecor() {
    const kind = this.track.def.theme.decor;
    if (kind === 'mobius') this._decorMobius();
    else if (kind === 'torus') this._decorTorus();
    else if (kind === 'double') this._decorDouble();
    else if (kind === 'hyper') this._decorHyper();
    else if (kind === 'poincare') this._decorPoincare();
  }

  _decorMobius() {
    // poliedros de tiza flotando en el vacío azul
    const geos = [
      new THREE.IcosahedronGeometry(10), new THREE.TorusKnotGeometry(8, 2.4, 60, 10),
      new THREE.OctahedronGeometry(11), new THREE.TorusGeometry(10, 3, 10, 24),
      new THREE.DodecahedronGeometry(9), new THREE.TetrahedronGeometry(12),
    ];
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, wireframe: true, transparent: true, opacity: 0.35 });
    const group = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], mat);
      const a = (i / 16) * Math.PI * 2;
      const r = 200 + (i % 3) * 70;
      m.position.set(r * Math.cos(a), -60 + (i % 5) * 45, r * Math.sin(a));
      m.userData.spin = 0.1 + (i % 4) * 0.05;
      group.add(m);
    }
    this.group.add(group);
    this.animated.push((t, dt) => {
      for (const m of group.children) { m.rotation.y += m.userData.spin * dt; m.rotation.x += m.userData.spin * 0.6 * dt; }
    });
  }

  _decorTorus() {
    // el toro gigante sobre cuya superficie corre la pista
    const geo = new THREE.TorusGeometry(95, 32.2, 36, 90);
    geo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x2a1255, transparent: true, opacity: 0.82, roughness: 0.8, metalness: 0.15,
    }));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x9a5fff, wireframe: true, transparent: true, opacity: 0.22,
    }));
    this.group.add(body, wire);

    // anillos de neón en torno al tubo, como una estación circular
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(36.5, 0.45, 8, 48), ringMat);
      ring.position.set(95 * Math.cos(a), 0, 95 * Math.sin(a));
      ring.rotation.y = -a + Math.PI / 2;
      this.group.add(ring);
    }
  }

  _decorDouble() {
    // dos grandes ruedas-anillo en el centro de cada lóbulo
    const colors = [0xff5d8f, 0x4ade80];
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 95 : -95;
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(42, 5, 14, 50),
        new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4, emissive: colors[i], emissiveIntensity: 0.35 }));
      wheel.position.set(x, 14, 0);
      this.group.add(wheel);
      // cabinas de feria
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
    // suelo de feria lejano
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(600, 48),
      new THREE.MeshStandardMaterial({ color: 0x521f05, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -60;
    this.group.add(floor);
  }

  _decorHyper() {
    // disco de Poincaré como suelo del mundo
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(260, 96),
      new THREE.MeshBasicMaterial({ map: poincareDiscTexture(), toneMapped: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -26;
    this.group.add(disc);

    // arcos geodésicos luminosos que se elevan del disco
    const arcMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, toneMapped: false, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 120 + (i % 3) * 50;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(40 + (i % 4) * 14, 0.6, 8, 40, Math.PI), arcMat);
      arc.position.set(r * Math.cos(a), -26, r * Math.sin(a));
      arc.rotation.y = a + Math.PI / 2;
      this.group.add(arc);
    }
    this.animated.push(t => { arcMat.opacity = 0.35 + 0.2 * Math.sin(t * 1.7); });
  }

  _decorPoincare() {
    // el gran dodecaedro: caras opuestas identificadas con el mismo color
    const R = 175;
    const geo = new THREE.DodecahedronGeometry(R);
    const pairColors = [0xff5d8f, 0x46d5ff, 0xffd23f, 0x4ade80, 0xb07cff, 0xff9a3c];

    // agrupar triángulos por normal de cara (12 caras, 6 pares opuestos)
    const pos = geo.getAttribute('position');
    const tri = new THREE.Triangle();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const faceDirs = [];
    const colors = new Float32Array(pos.count * 3);
    const cTmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      va.fromBufferAttribute(pos, i); vb.fromBufferAttribute(pos, i + 1); vc.fromBufferAttribute(pos, i + 2);
      tri.set(va, vb, vc);
      const n = tri.getNormal(new THREE.Vector3());
      let idx = faceDirs.findIndex(d => d.dot(n) > 0.99 || d.dot(n) < -0.99);
      if (idx === -1) { faceDirs.push(n.clone()); idx = faceDirs.length - 1; }
      cTmp.set(pairColors[idx % pairColors.length]);
      for (let k = 0; k < 3; k++) colors.set([cTmp.r, cTmp.g, cTmp.b], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const faces = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.10, side: THREE.BackSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.group.add(faces);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 10),
      new THREE.LineBasicMaterial({ color: 0xb09cff, transparent: true, opacity: 0.8, toneMapped: false }));
    this.group.add(edges);
    this.animated.push(t => { faces.material.opacity = 0.08 + 0.04 * Math.sin(t * 0.8); });

    // puertas-portal pentagonales en la pista
    const tr = this.track;
    for (const [i, sFrac] of (tr.def.portals ?? []).entries() ) {
      const s = sFrac * tr.length;
      const fr = tr.frameAt(s, 0, {});
      const pts = [];
      const Rp = tr.widthAt(s) + 4.5;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        pts.push(new THREE.Vector3(Math.cos(a) * Rp, Math.sin(a) * Rp + Rp * 0.5, 0));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.05);
      const color = pairColors[i % pairColors.length];
      const gate = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 60, 0.55, 8, true),
        new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.95 }));
      const m = new THREE.Matrix4().makeBasis(fr.B, fr.N, fr.T);
      gate.quaternion.setFromRotationMatrix(m);
      gate.position.copy(fr.pos);
      this.group.add(gate);

      // velo ondulado del portal
      const veil = new THREE.Mesh(
        new THREE.CircleGeometry(Rp * 0.92, 5),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
      veil.quaternion.copy(gate.quaternion);
      veil.rotateZ(Math.PI / 2 + Math.PI / 10);
      veil.position.copy(fr.pos).addScaledVector(fr.N, Rp * 0.5);
      this.group.add(veil);
      this.animated.push(t => { veil.material.opacity = 0.10 + 0.08 * Math.sin(t * 3 + i * 2); });

      this.portalGates.push({ s, color });
    }
  }
}
