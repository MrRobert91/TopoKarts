// Sintetiza la banda sonora del trailer (synthwave arcade ~128 BPM) y la
// escribe como WAV PCM 16-bit estéreo. Sin dependencias: todo es matemática.
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const BPM = 128;
const BEAT = 60 / BPM;            // 0.46875 s
const STEP = BEAT / 4;            // semicorchea
const DUR = +(process.argv[2] ?? 60);
const N = Math.ceil(DUR * SR);

const out = path.resolve(process.argv[3] ?? 'trailer/music.wav');

const L = new Float64Array(N);
const R = new Float64Array(N);

// ── utilidades de síntesis ───────────────────────────────────────────
const TAU = Math.PI * 2;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const saw = (p) => 2 * (p - Math.floor(p + 0.5));
const sqr = (p, d = 0.5) => ((p % 1) < d ? 1 : -1);
const tri = (p) => 2 * Math.abs(saw(p)) - 1;
function adsr(t, dur, a, d, s, r) {
  if (t < 0 || t > dur + r) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * (t - a) / d;
  if (t < dur) return s;
  return s * (1 - (t - dur) / r);
}
function add(buf, start, val) { if (start >= 0 && start < N) buf[start] += val; }

// nota: escribe un oscilador con envolvente en ambos canales
function note(startStep, lenSteps, freq, gain, wave, pan = 0, det = 0) {
  const t0 = startStep * STEP;
  const dur = lenSteps * STEP;
  const rel = 0.06;
  const i0 = Math.floor(t0 * SR);
  const i1 = Math.min(N, Math.floor((t0 + dur + rel) * SR));
  const gl = gain * (1 - Math.max(0, pan)) ** 0.5;
  const gr = gain * (1 - Math.max(0, -pan)) ** 0.5;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const env = adsr(t, dur, 0.005, 0.08, 0.7, rel);
    if (env <= 0) continue;
    const p = freq * t;
    let s;
    if (wave === 'saw') s = 0.5 * saw(p) + 0.5 * saw(p * (1 + det));
    else if (wave === 'sqr') s = sqr(p, 0.45);
    else if (wave === 'tri') s = tri(p);
    else s = Math.sin(TAU * p);
    s *= env;
    L[i] += s * gl;
    R[i] += s * gr;
  }
}

// kick: seno con barrido de pitch hacia abajo + click
function kick(startStep) {
  const t0 = startStep * STEP;
  const i0 = Math.floor(t0 * SR);
  const dur = 0.32;
  const i1 = Math.min(N, i0 + Math.floor(dur * SR));
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const f = 120 * Math.exp(-t * 22) + 45;
    const env = Math.exp(-t * 7.5);
    const click = Math.exp(-t * 120) * 0.6;
    const s = (Math.sin(TAU * f * t) * env + click) * 0.9;
    L[i] += s; R[i] += s;
  }
}

// hat: ruido filtrado corto
function hat(startStep, g = 0.18) {
  const t0 = startStep * STEP;
  const i0 = Math.floor(t0 * SR);
  const dur = 0.05;
  const i1 = Math.min(N, i0 + Math.floor(dur * SR));
  let prev = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const noise = Math.random() * 2 - 1;
    const hp = noise - prev; prev = noise;      // paso alto simple
    const s = hp * Math.exp(-t * 60) * g;
    L[i] += s; R[i] += s;
  }
}

// ── progresión y arreglo ─────────────────────────────────────────────
// Am - F - C - G (clásico, enérgico). Roots MIDI.
const prog = [57, 53, 48, 55];            // A2, F2, C2, G2
const chordTones = {
  57: [57, 60, 64], 53: [53, 57, 60], 48: [48, 52, 55], 55: [55, 59, 62],
};
const arpPat = [0, 1, 2, 1, 2, 1, 0, 2];  // índices dentro del acorde
const leadMotif = [76, 0, 74, 72, 0, 72, 69, 71]; // motivo (0 = silencio)

const totalSteps = Math.floor(DUR / STEP);
const stepsPerBar = 16;
const bars = Math.ceil(totalSteps / stepsPerBar);

for (let bar = 0; bar < bars; bar++) {
  const root = prog[bar % prog.length];
  const tones = chordTones[root];
  const base = bar * stepsPerBar;
  const energy = Math.min(1, bar / 3);      // build-up suave al inicio
  const fullBand = bar >= 2;                 // batería entra en compás 3

  for (let s = 0; s < stepsPerBar; s++) {
    const step = base + s;
    if (step >= totalSteps) break;

    // batería
    if (fullBand) {
      if (s % 4 === 0) kick(step);
      if (s % 2 === 1) hat(step, 0.14);
      if (s % 8 === 4) hat(step, 0.22);       // backbeat-ish
    }

    // bajo: root en negras con octava
    if (s % 4 === 0) note(step, 4, midi(root) , 0.42 * (0.4 + energy), 'saw', 0, 0.006);
    if (s % 4 === 2) note(step, 2, midi(root + 12), 0.16 * energy, 'sqr', 0);

    // arpegio brillante (semicorcheas)
    const an = tones[arpPat[s % arpPat.length] % tones.length] + 12;
    note(step, 1, midi(an), 0.13 * (0.5 + energy), 'sqr', (s % 2 ? 0.35 : -0.35), 0);

    // pad de acorde (entra suave)
    if (s % 8 === 0) {
      for (const ct of tones) note(step, 8, midi(ct), 0.05 * energy, 'tri', 0);
    }
  }

  // lead: entra a partir del compás 4, una nota por negra
  if (bar >= 4) {
    for (let q = 0; q < 8; q++) {
      const m = leadMotif[q % leadMotif.length];
      if (m) note(base + q * 2, 2, midi(m), 0.16, 'saw', 0.1, 0.004);
    }
  }
}

// ── máster: soft-clip, fade in/out ───────────────────────────────────
const fadeIn = Math.floor(0.8 * SR);
const fadeOut = Math.floor(2.2 * SR);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 0.85 / Math.max(0.001, peak);
const buf = Buffer.alloc(44 + N * 4);
// cabecera WAV
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const sc = (x) => Math.tanh(x * norm * 1.1);   // glue suave
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > N - fadeOut) g = Math.max(0, (N - i) / fadeOut);
  const l = Math.max(-1, Math.min(1, sc(L[i]) * g));
  const r = Math.max(-1, Math.min(1, sc(R[i]) * g));
  buf.writeInt16LE((l * 32767) | 0, 44 + i * 4);
  buf.writeInt16LE((r * 32767) | 0, 44 + i * 4 + 2);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`música: ${out}  (${DUR}s, ${bars} compases)`);
