import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

/** textura de asfalto matemático: líneas de coordenadas, borde y línea central */
export function roadTexture(theme) {
  const W = 256, H = 512; // H = a lo largo de la pista
  const c = canvas(W, H);
  const g = c.getContext('2d');

  g.fillStyle = css(theme.road);
  g.fillRect(0, 0, W, H);

  // rejilla de coordenadas estilo pizarra
  g.strokeStyle = 'rgba(80,90,160,0.18)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += W / 8) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let y = 0; y <= H; y += H / 16) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // línea central discontinua
  g.strokeStyle = css(theme.roadLine);
  g.lineWidth = 7;
  g.setLineDash([40, 28]);
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.setLineDash([]);

  // bandas laterales
  g.fillStyle = css(theme.edge);
  g.globalAlpha = 0.85;
  g.fillRect(0, 0, 10, H);
  g.fillRect(W - 10, 0, 10, H);
  g.globalAlpha = 1;

  // flechas de sentido (tiza)
  g.fillStyle = 'rgba(60,70,140,0.35)';
  for (let y = H / 8; y < H; y += H / 4) {
    g.beginPath();
    g.moveTo(W / 2, y - 26);
    g.lineTo(W / 2 - 17, y);
    g.lineTo(W / 2 - 6, y);
    g.lineTo(W / 2 - 6, y + 22);
    g.lineTo(W / 2 + 6, y + 22);
    g.lineTo(W / 2 + 6, y);
    g.lineTo(W / 2 + 17, y);
    g.closePath(); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
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
