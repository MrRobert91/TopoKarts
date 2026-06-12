import * as THREE from 'three';

/**
 * Kart de juguete matemático + piloto geométrico, todo procedural.
 * El grupo raíz está orientado con +Z hacia delante, +Y hacia arriba,
 * y su origen en el punto de contacto con la pista.
 */
export function buildKart(character) {
  const root = new THREE.Group();
  const color = new THREE.Color(character.color);
  const dark = color.clone().multiplyScalar(0.55);

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.5, metalness: 0.3 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1c28, roughness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.3, metalness: 0.6 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });

  // chasis: caja redondeada
  const chassis = new THREE.Mesh(roundedBox(2.3, 0.75, 3.4, 0.28), bodyMat);
  chassis.position.y = 0.85;
  root.add(chassis);

  // morro
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 1.0, 5), darkMat);
  nose.rotation.x = Math.PI / 2.4;
  nose.position.set(0, 0.95, 2.0);
  root.add(nose);

  // alerón trasero
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.7), darkMat);
  wing.position.set(0, 1.75, -1.7);
  root.add(wing);
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.3), darkMat);
    strut.position.set(sx * 0.9, 1.45, -1.7);
    root.add(strut);
  }

  // ruedas: toros pequeños
  const wheels = [];
  const wheelGeo = new THREE.TorusGeometry(0.42, 0.24, 12, 20);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12);
  for (const [x, z] of [[-1.25, 1.25], [1.25, 1.25], [-1.25, -1.25], [1.25, -1.25]]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(tire, hub);
    wheel.position.set(x, 0.62, z);
    root.add(wheel);
    wheels.push(wheel);
  }

  // tubos de escape
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 10), hubMat);
    pipe.rotation.x = Math.PI / 2 - 0.35;
    pipe.position.set(sx * 0.55, 1.1, -2.0);
    root.add(pipe);
  }

  // volante: un pequeño toro
  const wheelCol = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 18), darkMat);
  wheelCol.position.set(0, 1.5, 0.9);
  wheelCol.rotation.x = -1.0;
  root.add(wheelCol);

  // faros
  for (const sx of [-1, 1]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, toneMapped: false }));
    light.position.set(sx * 0.7, 1.0, 2.35);
    root.add(light);
  }

  // ── piloto geométrico ──
  const pilot = buildPilot(character, bodyMat, whiteMat);
  pilot.position.set(0, 1.5, -0.35);
  root.add(pilot);

  // llama de turbo (oculta por defecto)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.2, 10),
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

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { root, wheels, pilot, flame, shield };
}

function buildPilot(character, bodyMat, whiteMat) {
  const g = new THREE.Group();
  const headMat = new THREE.MeshStandardMaterial({
    color: character.color, roughness: 0.3, metalness: 0.05,
  });

  let head;
  const S = 0.85;
  switch (character.shape) {
    case 'cube': head = new THREE.Mesh(roundedBox(S * 1.5, S * 1.5, S * 1.5, 0.18), headMat); break;
    case 'tetra': head = new THREE.Mesh(new THREE.TetrahedronGeometry(S * 1.25), headMat); head.rotation.set(0.62, Math.PI / 4, 0); break;
    case 'dodeca': head = new THREE.Mesh(new THREE.DodecahedronGeometry(S * 1.05), headMat); break;
    case 'sphere': head = new THREE.Mesh(new THREE.SphereGeometry(S * 1.05, 24, 18), headMat); break;
    case 'cylinder': head = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.8, S * 0.8, S * 1.5, 20), headMat); break;
    case 'octa': head = new THREE.Mesh(new THREE.OctahedronGeometry(S * 1.15), headMat); break;
    default: head = new THREE.Mesh(new THREE.SphereGeometry(S, 20, 14), headMat);
  }
  head.position.y = 0.85;
  g.add(head);

  // ojos grandes
  const eyeWhite = new THREE.SphereGeometry(0.26, 14, 10);
  const pupilGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeWhite, whiteMat);
    eye.position.set(sx * 0.36, 1.05, 0.78);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0.03, 0.18);
    eye.add(pupil);
    g.add(eye);
  }

  // brazos flotantes (esferas-mano)
  const handGeo = new THREE.SphereGeometry(0.24, 12, 10);
  for (const sx of [-1, 1]) {
    const hand = new THREE.Mesh(handGeo, whiteMat);
    hand.position.set(sx * 0.95, 0.45, 0.75);
    hand.userData.baseY = hand.position.y;
    g.add(hand);
  }

  // gafas de piloto para Cilindra, bigote para Dode
  if (character.shape === 'cylinder') {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 24), new THREE.MeshStandardMaterial({ color: 0x222233 }));
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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
  geo.center();
  return geo;
}
