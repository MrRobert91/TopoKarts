import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

/** grano de asfalto + desgaste sobre un contexto dado */
function asphaltNoise(g, W, H, amount = 2600) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5
      ? `rgba(255,255,255,${0.025 + Math.random() * 0.05})`
      : `rgba(20,24,48,${0.03 + Math.random() * 0.06})`;
    const sz = 1 + Math.random() * 2.2;
    g.fillRect(Math.random() * W, Math.random() * H, sz, sz);
  }
  // bandas de rodadura (zonas oscurecidas donde pasan las ruedas)
  for (const x of [W * 0.30, W * 0.70]) {
    const grd = g.createLinearGradient(x - W * 0.09, 0, x + W * 0.09, 0);
    grd.addColorStop(0, 'rgba(20,22,40,0)');
    grd.addColorStop(0.5, 'rgba(20,22,40,0.13)');
    grd.addColorStop(1, 'rgba(20,22,40,0)');
    g.fillStyle = grd;
    g.fillRect(x - W * 0.09, 0, W * 0.18, H);
  }
}

/** pianos rojo-blanco en los bordes */
function curbs(g, W, H, curbW) {
  for (const x0 of [0, W - curbW]) {
    for (let y = 0; y < H; y += 32) {
      g.fillStyle = (y / 32) % 2 ? '#e8362e' : '#f5f2ec';
      g.fillRect(x0, y, curbW, 32);
    }
    // sombreado interior del piano
    const grd = g.createLinearGradient(x0, 0, x0 + curbW, 0);
    grd.addColorStop(x0 === 0 ? 1 : 0, 'rgba(0,0,0,0.25)');
    grd.addColorStop(x0 === 0 ? 0 : 1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x0, 0, curbW, H);
  }
}

/** textura de carretera realista: asfalto, pianos rojo-blanco y marcas viales */
export function roadTexture(theme) {
  const W = 512, H = 1024; // H = a lo largo de la pista
  const c = canvas(W, H);
  const g = c.getContext('2d');

  // asfalto coloreado del tema, oscurecido para contrastar con el cielo
  const base = new THREE.Color(theme.road).multiplyScalar(0.8);
  g.fillStyle = '#' + base.getHexString();
  g.fillRect(0, 0, W, H);
  asphaltNoise(g, W, H, 3400);

  // rejilla de coordenadas sutil (la firma matemática del juego)
  g.strokeStyle = 'rgba(70,80,150,0.13)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += W / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += H / 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  curbs(g, W, H, 26);

  // líneas blancas de carril junto a los pianos
  g.fillStyle = 'rgba(245,243,235,0.85)';
  g.fillRect(34, 0, 5, H);
  g.fillRect(W - 39, 0, 5, H);

  // línea central discontinua
  g.strokeStyle = css(theme.roadLine);
  g.lineWidth = 10;
  g.setLineDash([70, 46]);
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.setLineDash([]);

  // flechas de sentido pintadas (desgastadas)
  g.fillStyle = 'rgba(245,243,235,0.5)';
  for (let y = H / 8; y < H; y += H / 4) {
    g.beginPath();
    g.moveTo(W / 2, y - 44);
    g.lineTo(W / 2 - 28, y);
    g.lineTo(W / 2 - 10, y);
    g.lineTo(W / 2 - 10, y + 38);
    g.lineTo(W / 2 + 10, y + 38);
    g.lineTo(W / 2 + 10, y);
    g.lineTo(W / 2 + 28, y);
    g.closePath(); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** línea de meta a cuadros */
export function finishTexture() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  const s = 16;
  for (let x = 0; x < 256 / s; x++)
    for (let y = 0; y < 64 / s; y++) {
      g.fillStyle = (x + y) % 2 ? '#101018' : '#ffffff';
      g.fillRect(x * s, y * s, s, s);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** símbolo matemático para cajas de objetos */
export function symbolTexture(symbol, color = '#46d5ff') {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.font = '700 86px "Baloo 2", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(symbol, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** chevrones de turbo */
export function boostTexture(hex) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = css(hex);
  for (let i = 0; i < 3; i++) {
    const y = 100 - i * 36;
    g.globalAlpha = 0.55 + i * 0.2;
    g.beginPath();
    g.moveTo(14, y); g.lineTo(64, y - 26); g.lineTo(114, y);
    g.lineTo(114, y - 14); g.lineTo(64, y - 40); g.lineTo(14, y - 14);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** teselación pseudo-hiperbólica para el disco de Poincaré */
export function poincareDiscTexture() {
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2 - 6;

  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  grd.addColorStop(0, '#0c4f4a');
  grd.addColorStop(0.8, '#06302f');
  grd.addColorStop(1, '#031a1a');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();

  // anillos de "triángulos" que se encogen hacia el borde (métrica hiperbólica)
  g.strokeStyle = 'rgba(74,222,128,0.5)';
  let r0 = 0;
  for (let ring = 0; ring < 9; ring++) {
    const r1 = R * Math.tanh((ring + 1) * 0.42);
    const n = 7 * Math.pow(2, Math.min(ring, 4));
    g.lineWidth = Math.max(1, 5 - ring * 0.6);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      // arco "geodésico" aproximado: curva hacia el centro
      g.beginPath();
      g.moveTo(cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0));
      g.quadraticCurveTo(
        cx + (r0 + r1) * 0.46 * Math.cos(am),
        cy + (r0 + r1) * 0.46 * Math.sin(am),
        cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1));
      g.stroke();
      g.beginPath();
      g.moveTo(cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0));
      g.lineTo(cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0));
      g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.stroke();
    r0 = r1;
  }
  // borde infinito
  g.strokeStyle = 'rgba(255,210,63,0.9)';
  g.lineWidth = 8;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura para una superficie completa (esfera/toro): rejilla de
 * coordenadas, banda de carrera resaltada, línea central y fórmulas
 * de la figura pintadas como tiza.
 */
export function surfaceTexture(theme, { bandFrac = 0.12, formulas = [], vMin = 0, vMax = 1 } = {}) {
  const W = 2048, H = 1024;
  const c = canvas(W, H);
  const g = c.getContext('2d');

  const baseCol = new THREE.Color(theme.road).multiplyScalar(0.72);
  g.fillStyle = '#' + baseCol.getHexString();
  g.fillRect(0, 0, W, H);
  asphaltNoise(g, W, H, 9000);

  // mapeo v (0..1 de la textura puede cubrir solo parte del período)
  const vToY = (v) => H * (1 - (v - vMin) / (vMax - vMin));
  const bandTop = vToY(0.5 + bandFrac), bandBot = vToY(0.5 - bandFrac);

  // banda de carrera (asfalto más oscuro para que contraste)
  const bandCol = new THREE.Color(theme.band ?? theme.edge).multiplyScalar(0.75);
  g.fillStyle = '#' + bandCol.getHexString();
  g.globalAlpha = 0.55;
  g.fillRect(0, Math.min(bandTop, bandBot), W, Math.abs(bandBot - bandTop));
  g.globalAlpha = 1;

  // rejilla de coordenadas
  g.strokeStyle = 'rgba(70,80,150,0.16)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += W / 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += H / 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  // pianos rojo-blanco en los bordes de la banda de carrera
  for (const y of [bandTop, bandBot]) {
    const yy = Math.round(Math.min(Math.max(y - 7, 0), H - 14));
    for (let x = 0; x < W; x += 36) {
      g.fillStyle = (x / 36) % 2 ? '#e8362e' : '#f5f2ec';
      g.fillRect(x, yy, 36, 14);
    }
  }

  // línea central discontinua
  const midY = vToY(0.5);
  g.strokeStyle = css(theme.roadLine);
  g.lineWidth = 6;
  g.setLineDash([46, 30]);
  g.beginPath(); g.moveTo(0, midY); g.lineTo(W, midY); g.stroke();
  g.setLineDash([]);

  // flechas de sentido sobre la banda
  g.fillStyle = 'rgba(60,70,140,0.4)';
  for (let x = W / 16; x < W; x += W / 8) {
    g.beginPath();
    g.moveTo(x + 26, midY);
    g.lineTo(x, midY - 14);
    g.lineTo(x + 8, midY);
    g.lineTo(x, midY + 14);
    g.closePath(); g.fill();
  }

  // fórmulas de tiza fuera de la banda
  g.font = 'italic 600 44px "Space Grotesk", monospace';
  g.fillStyle = 'rgba(60,70,150,0.5)';
  for (const [i, f] of formulas.entries()) {
    const x = ((i * 0.27 + 0.07) % 1) * W;
    const above = i % 2 === 0;
    const y = above ? Math.min(bandTop, bandBot) - 60 - (i % 3) * 90 : Math.max(bandTop, bandBot) + 90 + (i % 3) * 90;
    g.save();
    g.translate(x, Math.max(50, Math.min(H - 30, y)));
    g.rotate((i % 2 ? 1 : -1) * 0.04);
    g.fillText(f, 0, 0);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** fórmula flotante luminosa */
export function formulaSprite(text, color = '#9fd0ff') {
  const c = canvas(1024, 192);
  const g = c.getContext('2d');
  g.font = 'italic 600 84px "Space Grotesk", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.globalAlpha = 0.92;
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.85,
  }));
  sp.scale.set(36, 6.75, 1);
  return sp;
}

/** rayas diagonales negro-amarillo de peligro */
export function hazardTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f7c948';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1d1d24';
  for (let i = -4; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0);
    g.lineTo(i * 32 + 32 + 64, 128); g.lineTo(i * 32 + 64, 128);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** bandas rojo-blanco para conos */
export function coneStripesTexture() {
  const c = canvas(64, 128);
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#f5f2ec' : '#e8362e';
    g.fillRect(0, i * 32, 64, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** brillo radial para halos/nebulosas */
export function glowTexture(colorCss = '#ffffff') {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, colorCss);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** cartel de texto flotante */
export function textSprite(text, { color = '#ffffff', bg = 'rgba(20,22,50,0.85)', size = 56 } = {}) {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 14, 496, 100, 26);
  g.fill();
  g.font = `800 ${size}px "Baloo 2", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(24, 6, 1);
  return sp;
}
