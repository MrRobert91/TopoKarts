import * as THREE from 'three';

/** Fondo 3D animado para los menús: una cinta de Möbius girando entre estrellas. */
export function createMenuBackground() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0b1e, 0.012);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
  camera.position.set(0, 6, 34);

  // banda de Möbius paramétrica
  const segU = 180, segV = 10, R = 12, W2 = 3.4;
  const positions = [], indices = [];
  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2;
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV - 0.5) * 2 * W2;
      positions.push(
        (R + v * Math.cos(u / 2)) * Math.cos(u),
        v * Math.sin(u / 2),
        (R + v * Math.cos(u / 2)) * Math.sin(u));
    }
  }
  for (let i = 0; i < segU; i++)
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j, b = a + segV + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const band = new THREE.Mesh(geo, new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }));
  scene.add(band);

  const edge = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
    color: 0x46d5ff, wireframe: true, transparent: true, opacity: 0.08,
  }));
  scene.add(edge);

  // poliedros lejanos
  const wmat = new THREE.MeshBasicMaterial({ color: 0x7c6bff, wireframe: true, transparent: true, opacity: 0.3 });
  const polys = new THREE.Group();
  const geos = [new THREE.IcosahedronGeometry(2.4), new THREE.TorusKnotGeometry(2, 0.6, 50, 8), new THREE.DodecahedronGeometry(2.4)];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(geos[i % 3], wmat);
    const a = (i / 9) * Math.PI * 2;
    m.position.set(28 * Math.cos(a), -6 + (i % 3) * 7, 28 * Math.sin(a) - 4);
    polys.add(m);
  }
  scene.add(polys);

  // estrellas
  const N = 500, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(120 + Math.random() * 240);
    sp.set([v.x, v.y, v.z], i * 3);
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 })));

  return {
    render(renderer, t) {
      band.rotation.y = t * 0.18;
      band.rotation.x = 0.45 + Math.sin(t * 0.1) * 0.1;
      edge.rotation.copy(band.rotation);
      polys.rotation.y = -t * 0.03;
      camera.position.x = Math.sin(t * 0.06) * 4;
      camera.lookAt(0, 0, 0);
      const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
      if (camera.aspect !== W / H) { camera.aspect = W / H; camera.updateProjectionMatrix(); }
      renderer.setViewport(0, 0, W, H);
      renderer.render(scene, camera);
    },
  };
}
