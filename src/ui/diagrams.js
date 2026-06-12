/**
 * Diagramas topológicos 2D compartidos por el minimapa y las pantallas
 * educativas. Cada circuito tiene su representación matemática:
 *  - mobius:   rectángulo con flechas opuestas (banda no orientable)
 *  - torus:    cuadrado con lados opuestos identificados
 *  - double:   esquema de dos agujeros (género 2)
 *  - hyper:    disco de Poincaré
 *  - poincare: red de pentágonos con caras identificadas
 */

const TAU = Math.PI * 2;

function arrow(g, x, y, angle, size, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(size, 0);
  g.lineTo(-size * 0.7, size * 0.65);
  g.lineTo(-size * 0.3, 0);
  g.lineTo(-size * 0.7, -size * 0.65);
  g.closePath();
  g.fill();
  g.restore();
}

/** dibuja el marco del diagrama; devuelve mapper (a, q01) -> [x, y] en px */
export function drawTopoFrame(g, type, W, H, { highlight = false } = {}) {
  const pad = 16;
  const w = W - pad * 2, h = H - pad * 2;
  const cx = W / 2, cy = H / 2;
  const edge = highlight ? '#ffd23f' : 'rgba(140,150,255,0.85)';
  const edge2 = highlight ? '#ff5d8f' : 'rgba(255,93,143,0.85)';
  g.lineWidth = 2;

  if (type === 'mobius') {
    const rx = pad, ry = cy - h * 0.28, rw = w, rh = h * 0.56;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.strokeRect(rx, ry, rw, rh);
    // lados izquierdo/derecho identificados con flechas OPUESTAS
    g.strokeStyle = edge;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx, ry + rh); g.stroke();
    g.beginPath(); g.moveTo(rx + rw, ry); g.lineTo(rx + rw, ry + rh); g.stroke();
    arrow(g, rx, cy - rh * 0.2, Math.PI / 2, 6, edge);
    arrow(g, rx + rw, cy + rh * 0.2, -Math.PI / 2, 6, edge);
    if (highlight) {
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,210,63,0.5)';
      g.beginPath(); g.moveTo(rx, cy - rh * 0.3); g.lineTo(rx + rw, cy + rh * 0.3); g.stroke();
      g.setLineDash([]);
    }
    return (a, q01, flipped) => [
      rx + (a / TAU) * rw,
      cy + (flipped ? -1 : 1) * (q01 - 0.5) * rh * 0.8,
    ];
  }

  if (type === 'torus') {
    const size = Math.min(w, h);
    const rx = cx - size / 2, ry = cy - size / 2;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.strokeRect(rx, ry, size, size);
    g.strokeStyle = edge; g.lineWidth = 3;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + size, ry); g.stroke();
    g.beginPath(); g.moveTo(rx, ry + size); g.lineTo(rx + size, ry + size); g.stroke();
    arrow(g, cx, ry, 0, 6, edge);
    arrow(g, cx, ry + size, 0, 6, edge);
    g.strokeStyle = edge2;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx, ry + size); g.stroke();
    g.beginPath(); g.moveTo(rx + size, ry); g.lineTo(rx + size, ry + size); g.stroke();
    arrow(g, rx, cy, Math.PI / 2, 6, edge2);
    arrow(g, rx + size, cy, Math.PI / 2, 6, edge2);
    // (a, q01) -> coords del cuadrado: x = ciclo A, y = ciclo B (la pista da 2 vueltas al tubo)
    return (a) => {
      const phi = 2 * a + 0.9 * Math.sin(a);
      const u = (a / TAU) % 1;
      const v = ((phi / TAU) % 1 + 1) % 1;
      return [rx + u * size, ry + (1 - v) * size];
    };
  }

  if (type === 'double') {
    // lemniscata con dos agujeros
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * TAU;
      const x = cx + Math.sin(a) * w * 0.46;
      const y = cy + Math.sin(a) * Math.cos(a) * h * 0.62;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // agujeros
    for (const [i, hx] of [[0, cx + w * 0.29], [1, cx - w * 0.29]]) {
      g.strokeStyle = i ? '#4ade80' : '#ff5d8f';
      g.lineWidth = highlight ? 3.5 : 2;
      g.beginPath(); g.arc(hx, cy, Math.min(w, h) * 0.12, 0, TAU); g.stroke();
      g.fillStyle = g.strokeStyle;
      g.font = '700 10px "Space Grotesk"';
      g.textAlign = 'center';
      g.fillText(String(i + 1), hx, cy + 3.5);
    }
    return (a) => [
      cx + Math.sin(a) * w * 0.46,
      cy + Math.sin(a) * Math.cos(a) * h * 0.62,
    ];
  }

  if (type === 'hyper') {
    const R = Math.min(w, h) / 2;
    g.strokeStyle = highlight ? '#ffd23f' : 'rgba(74,222,128,0.9)';
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    // geodésicas: arcos ortogonales al borde
    g.strokeStyle = 'rgba(74,222,128,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU, a1 = a0 + TAU * 0.3;
      const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
      const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      g.beginPath();
      g.moveTo(...p0);
      g.quadraticCurveTo(cx + (mid[0] - cx) * 0.3, cy + (mid[1] - cy) * 0.3, ...p1);
      g.stroke();
    }
    return (a) => {
      const r = (88 + 42 * Math.sin(3 * a)) / 132;
      const rd = Math.tanh(r * 1.25) / Math.tanh(1.25);
      return [cx + rd * R * Math.cos(a), cy + rd * R * Math.sin(a)];
    };
  }

  if (type === 'poincare') {
    // red central de pentágonos (esquema)
    const R = Math.min(w, h) * 0.22;
    const penta = (px, py, r, rot, color, fill) => {
      g.beginPath();
      for (let k = 0; k <= 5; k++) {
        const ang = rot + (k / 5) * TAU - Math.PI / 2;
        const x = px + r * Math.cos(ang), y = py + r * Math.sin(ang);
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    };
    const cols = ['#ff5d8f', '#46d5ff', '#ffd23f', '#4ade80', '#b07cff'];
    penta(cx, cy, R, 0, 'rgba(255,255,255,0.7)');
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * TAU - Math.PI / 2 + Math.PI / 5;
      const d = R * 1.62;
      penta(cx + d * Math.cos(ang), cy + d * Math.sin(ang), R * 0.62, ang, cols[i],
        highlight ? cols[i] + '33' : undefined);
    }
    return (a) => {
      const x = (Math.sin(a) + 2 * Math.sin(2 * a)) / 3.1;
      const y = (Math.cos(a) - 2 * Math.cos(2 * a)) / 3.1;
      return [cx + x * w * 0.42, cy + y * h * 0.42];
    };
  }

  // genérico
  g.strokeStyle = edge;
  g.beginPath(); g.arc(cx, cy, Math.min(w, h) / 2, 0, TAU); g.stroke();
  return (a) => [cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * h * 0.4];
}

/** vista "normal": proyección cenital de la spline real */
export function drawNormalFrame(g, track, W, H) {
  const pts = track.positions;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 14;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  const ox = W / 2 - ((minX + maxX) / 2) * sc;
  const oy = H / 2 + ((minZ + maxZ) / 2) * sc;
  const toPx = (p) => [ox + p.x * sc, oy - p.z * sc];

  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= pts.length; i += 6) {
    const [x, y] = toPx(pts[i % pts.length]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.stroke();
  return toPx;
}
