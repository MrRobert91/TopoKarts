import * as THREE from 'three';

/**
 * Karts procedurales con personalidad: cada personaje tiene una silueta
 * de coche distinta, pintura con barniz (clearcoat), llantas con radios,
 * dorsal de carrera y piloto geométrico con ojos.
 * +Z hacia delante, +Y arriba, origen en el contacto con la pista.
 */
export function buildKart(character) {
  const root = new THREE.Group();
  const color = new THREE.Color(character.color);
  const accent = new THREE.Color(character.accent ?? 0xffffff);

  const M = {
    paint: new THREE.MeshPhysicalMaterial({
      color, clearcoat: 1, clearcoatRoughness: 0.12, roughness: 0.32, metalness: 0.1,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: accent, clearcoat: 0.8, clearcoatRoughness: 0.2, roughness: 0.4, metalness: 0.1,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.6, metalness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.22, metalness: 0.95 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x17171f, roughness: 0.92 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9fd4ff, transparent: true, opacity: 0.4, roughness: 0.06, metalness: 0.1,
    }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.3 }),
  };

  // ── carrocería según personaje ──
  const body = new THREE.Group();
  BODY_BUILDERS[character.shape]?.(body, M) ?? BODY_BUILDERS.cube(body, M);
  root.add(body);

  // suelo plano común (placa inferior)
  const plate = new THREE.Mesh(roundedBox(2.2, 0.22, 3.5, 0.1), M.dark);
  plate.position.y = 0.55;
  root.add(plate);

  // parachoques delantero y trasero
  for (const [z, w] of [[1.95, 2.0], [-1.95, 2.2]]) {
    const bumper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, w, 6, 12), M.chrome);
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 0.62, z);
    root.add(bumper);
  }

  // ── ruedas con llanta y radios ──
  const wheels = [];
  const tireGeo = new THREE.TorusGeometry(0.44, 0.25, 14, 28);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 18);
  const spokeGeo = new THREE.BoxGeometry(0.07, 0.4, 0.1);
  const hubGeo = new THREE.SphereGeometry(0.09, 10, 8);
  for (const [x, z, front] of [[-1.25, 1.3, 1], [1.25, 1.3, 1], [-1.3, -1.3, 0], [1.3, -1.3, 0]]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, M.tire);
    tire.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(rimGeo, M.chrome);
    rim.rotation.z = Math.PI / 2;
    wheel.add(tire, rim);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(spokeGeo, M.chrome);
      spoke.rotation.x = (k / 5) * Math.PI * 2;
      spoke.translateY(0.12);
      rim.add(spoke);
    }
    const hub = new THREE.Mesh(hubGeo, new THREE.MeshStandardMaterial({
      color: character.accent ?? 0xffd23f, roughness: 0.3, metalness: 0.5,
    }));
    hub.position.x = x > 0 ? 0.18 : -0.18;
    wheel.add(hub);
    wheel.position.set(x, 0.66, z);
    wheel.userData.front = front;
    root.add(wheel);
    wheels.push(wheel);
  }

  // tubos de escape
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.75, 14), M.chrome);
    pipe.rotation.x = Math.PI / 2 - 0.35;
    pipe.position.set(sx * 0.55, 1.05, -2.05);
    root.add(pipe);
  }

  // faros + pilotos traseros
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.6, roughness: 0.3 }));
    head.position.set(sx * 0.68, 0.95, 2.25);
    root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xe8362e, emissive: 0xc01010, emissiveIntensity: 1.4, roughness: 0.4 }));
    tail.position.set(sx * 0.75, 1.15, -2.18);
    root.add(tail);
  }

  // dorsal con número
  const decal = new THREE.Sprite(new THREE.SpriteMaterial({
    map: numberDecal(character.num ?? 0, '#' + accent.getHexString()),
    transparent: true, depthWrite: false,
  }));
  decal.scale.set(0.9, 0.9, 1);
  decal.position.set(0, 1.95, 0.35);
  root.add(decal);

  // ── piloto ──
  const pilot = buildPilot(character, M);
  pilot.position.set(0, 1.45, -0.45);
  root.add(pilot);

  // llama de turbo (oculta)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.2, 12),
    new THREE.MeshBasicMaterial({ color: 0x46d5ff, transparent: true, opacity: 0.85, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, 1.0, -3.0);
  flame.visible = false;
  root.add(flame);

  // escudo de Euler (oculto)
  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6, 0),
    new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.65, toneMapped: false }));
  shield.position.y = 1.2;
  shield.visible = false;
  root.add(shield);

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, wheels, pilot, flame, shield };
}

/* siluetas de carrocería por personaje */
const BODY_BUILDERS = {
  // Cubito: buggy compacto y robusto
  cube(g, M) {
    const cab = new THREE.Mesh(roundedBox(2.1, 0.95, 3.0, 0.3), M.paint);
    cab.position.set(0, 1.05, 0.1);
    const hood = new THREE.Mesh(roundedBox(1.7, 0.5, 1.0, 0.2), M.accent);
    hood.position.set(0, 0.95, 1.65);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.1, 10, 22, Math.PI), M.chrome);
    roll.position.set(0, 1.55, -0.9);
    roll.rotation.y = Math.PI / 2;
    g.add(cab, hood, roll);
  },
  // Tria: flecha de competición, morro afilado y alerón grande
  tetra(g, M) {
    const hull = new THREE.Mesh(wedgeGeo(2.0, 0.85, 3.6), M.paint);
    hull.position.set(0, 0.95, 0.2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 4), M.accent);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.85, 2.5);
    const wing = new THREE.Mesh(roundedBox(2.6, 0.1, 0.8, 0.05), M.accent);
    wing.position.set(0, 1.85, -1.85);
    const struts = new THREE.Group();
    for (const sx of [-0.9, 0.9]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.3), M.dark);
      st.position.set(sx, 1.45, -1.85);
      struts.add(st);
    }
    g.add(hull, nose, wing, struts);
  },
  // Dode: gran turismo elegante con capó largo y cromados
  dodeca(g, M) {
    const cab = new THREE.Mesh(roundedBox(2.0, 0.8, 1.7, 0.32), M.paint);
    cab.position.set(0, 1.15, -0.7);
    const hoodLong = new THREE.Mesh(roundedBox(1.85, 0.55, 2.2, 0.26), M.paint);
    hoodLong.position.set(0, 0.95, 0.95);
    const grill = new THREE.Mesh(roundedBox(1.2, 0.4, 0.18, 0.08), M.chrome);
    grill.position.set(0, 0.85, 2.1);
    const trim = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 2.0, 6, 10), M.chrome);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, 1.28, 0.9);
    const screen = new THREE.Mesh(roundedBox(1.6, 0.5, 0.1, 0.05), M.glass);
    screen.position.set(0, 1.45, 0.12);
    screen.rotation.x = -0.35;
    g.add(cab, hoodLong, grill, trim, screen);
  },
  // Esferín: cápsula burbuja
  sphere(g, M) {
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1.35, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.62), M.paint);
    hull.scale.set(0.85, 0.8, 1.25);
    hull.position.set(0, 0.68, 0);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.09, 10, 36), M.accent);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(0.85, 1.25, 1);
    belt.position.y = 1.0;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    dome.position.set(0, 1.35, -0.3);
    g.add(hull, belt, dome);
  },
  // Cilindra: roadster barril con morro redondeado
  cylinder(g, M) {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.2, 26, 1), M.paint);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.78);
    hull.position.set(0, 1.0, 0);
    const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.accent);
    noseCap.rotation.x = Math.PI / 2;
    noseCap.scale.set(1, 0.78, 0.7);
    noseCap.position.set(0, 1.0, 1.6);
    const fin = new THREE.Mesh(wedgeGeo(0.12, 0.7, 1.1), M.accent);
    fin.position.set(0, 1.85, -1.4);
    g.add(hull, noseCap, fin);
  },
  // Octa: kart araña con chasis visto
  octa(g, M) {
    const pod = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), M.paint);
    pod.scale.set(0.9, 0.7, 1.3);
    pod.position.set(0, 1.05, 0.1);
    const frame = new THREE.Group();
    for (const [x, z] of [[-0.9, 1.4], [0.9, 1.4], [-1.0, -1.4], [1.0, -1.4]]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), M.chrome);
      tube.position.set(x * 0.6, 0.95, z * 0.75);
      tube.rotation.z = x > 0 ? -0.9 : 0.9;
      frame.add(tube);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), M.dark);
    antenna.position.set(-0.8, 2.2, -1.5);
    const flagGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0.55, 0.65, 0), new THREE.Vector3(0, 0.5, 0),
    ]);
    flagGeo.setIndex([0, 1, 2]);
    flagGeo.computeVertexNormals();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
    antenna.add(flag);
    g.add(pod, frame, antenna);
  },
};

function buildPilot(character, M) {
  const g = new THREE.Group();
  const headMat = new THREE.MeshPhysicalMaterial({
    color: character.color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3,
  });

  let head;
  const S = 0.85;
  switch (character.shape) {
    case 'cube': head = new THREE.Mesh(roundedBox(S * 1.5, S * 1.5, S * 1.5, 0.2), headMat); break;
    case 'tetra': head = new THREE.Mesh(new THREE.TetrahedronGeometry(S * 1.25), headMat); head.rotation.set(0.62, Math.PI / 4, 0); break;
    case 'dodeca': head = new THREE.Mesh(new THREE.DodecahedronGeometry(S * 1.05), headMat); break;
    case 'sphere': head = new THREE.Mesh(new THREE.SphereGeometry(S * 1.05, 28, 22), headMat); break;
    case 'cylinder': head = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.8, S * 0.8, S * 1.5, 26), headMat); break;
    case 'octa': head = new THREE.Mesh(new THREE.OctahedronGeometry(S * 1.15), headMat); break;
    default: head = new THREE.Mesh(new THREE.SphereGeometry(S, 22, 16), headMat);
  }
  head.position.y = 0.85;
  g.add(head);

  const eyeWhite = new THREE.SphereGeometry(0.26, 16, 12);
  const pupilGeo = new THREE.SphereGeometry(0.13, 12, 10);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.15 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeWhite, M.white);
    eye.position.set(sx * 0.36, 1.05, 0.78);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0.03, 0.18);
    eye.add(pupil);
    g.add(eye);
  }

  const handGeo = new THREE.SphereGeometry(0.24, 14, 10);
  for (const sx of [-1, 1]) {
    const hand = new THREE.Mesh(handGeo, M.white);
    hand.position.set(sx * 0.95, 0.45, 0.75);
    g.add(hand);
  }

  if (character.shape === 'cylinder') {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 10, 28), new THREE.MeshStandardMaterial({ color: 0x222233 }));
    strap.rotation.x = Math.PI / 2;
    strap.position.y = 1.25;
    g.add(strap);
  } else if (character.shape === 'dodeca') {
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x3a2a10 }));
    mo.position.set(0, 0.72, 0.92);
    g.add(mo);
  }
  return g;
}

function numberDecal(num, colorCss) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
  g.lineWidth = 7;
  g.strokeStyle = colorCss;
  g.stroke();
  g.font = '800 64px "Baloo 2", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1d1d35';
  g.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wedgeGeo(w, h, d) {
  // prisma en cuña (morro bajo, cola alta)
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(d / 2, h * 0.35);
  shape.lineTo(-d / 2 + d * 0.28, h);
  shape.lineTo(-d / 2, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2); // morro bajo hacia +Z
  geo.center();
  geo.translate(0, 0, 0);
  return geo;
}

function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r, y = -h / 2 + r, w2 = w - 2 * r, h2 = h - 2 * r;
  shape.moveTo(x, y - r);
  shape.lineTo(x + w2, y - r);
  shape.absarc(x + w2, y, r, -Math.PI / 2, 0);
  shape.lineTo(x + w2 + r, y + h2);
  shape.absarc(x + w2, y + h2, r, 0, Math.PI / 2);
  shape.lineTo(x, y + h2 + r);
  shape.absarc(x, y + h2, r, Math.PI / 2, Math.PI);
  shape.lineTo(x - r, y);
  shape.absarc(x, y, r, Math.PI, Math.PI * 1.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 8 });
  geo.center();
  return geo;
}
