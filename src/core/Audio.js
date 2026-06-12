/**
 * Audio 100% procedural con WebAudio: motores, efectos y una música
 * generativa sencilla con personalidad distinta por circuito.
 */
const SCALES = {
  mobius:   { notes: [0, 2, 4, 7, 9], base: 220, tempo: 132, wave: 'square', vol: 0.05 },
  torus:    { notes: [0, 3, 5, 7, 10], base: 174, tempo: 112, wave: 'sawtooth', vol: 0.045 },
  double:   { notes: [0, 2, 4, 5, 7, 9, 11], base: 262, tempo: 144, wave: 'triangle', vol: 0.055 },
  hyper:    { notes: [0, 1, 4, 6, 8, 10], base: 233, tempo: 160, wave: 'sawtooth', vol: 0.04 },
  poincare: { notes: [0, 2, 3, 7, 8], base: 147, tempo: 96, wave: 'triangle', vol: 0.05 },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.engineNodes = [];
    this.musicTimer = null;
    this.enabled = true;
  }

  /** debe llamarse tras un gesto del usuario */
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
  }

  // ── motores ────────────────────────────────────────────────────────
  startEngines(n) {
    if (!this.ctx) return;
    this.stopEngines();
    for (let i = 0; i < n; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 25;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      osc.connect(filter); sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start(); sub.start();
      this.engineNodes.push({ osc, sub, filter, gain });
    }
  }

  engines(speeds) {
    if (!this.ctx) return;
    for (const [i, sNorm] of speeds.entries()) {
      const e = this.engineNodes[i];
      if (!e) continue;
      const s = Math.min(1.4, Math.abs(sNorm));
      const t = this.ctx.currentTime;
      e.osc.frequency.setTargetAtTime(45 + s * 150, t, 0.08);
      e.sub.frequency.setTargetAtTime(22 + s * 75, t, 0.08);
      e.filter.frequency.setTargetAtTime(280 + s * 1400, t, 0.1);
      e.gain.gain.setTargetAtTime(0.025 + s * 0.035, t, 0.1);
    }
  }

  stopEngines() {
    for (const e of this.engineNodes) { try { e.osc.stop(); e.sub.stop(); } catch {} }
    this.engineNodes = [];
  }

  // ── efectos ────────────────────────────────────────────────────────
  _tone(freq, dur, { type = 'sine', vol = 0.18, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'beep': this._tone(440, 0.18, { type: 'square', vol: 0.14 }); break;
      case 'go': this._tone(880, 0.5, { type: 'square', vol: 0.16 }); this._tone(1320, 0.4, { delay: 0.05, vol: 0.1 }); break;
      case 'pickup': this._tone(1568, 0.25, { vol: 0.14 }); this._tone(2093, 0.3, { delay: 0.07, vol: 0.12 }); break;
      case 'boost': this._tone(200, 0.6, { type: 'sawtooth', slide: 900, vol: 0.14 }); break;
      case 'portal': this._tone(600, 0.5, { type: 'sine', slide: -380, vol: 0.16 }); this._tone(900, 0.5, { delay: 0.08, slide: 500, vol: 0.1 }); break;
      case 'flip': this._tone(800, 0.45, { type: 'sawtooth', slide: -640, vol: 0.13 }); break;
      case 'shield': this._tone(523, 0.12, { vol: 0.12 }); this._tone(659, 0.12, { delay: 0.09, vol: 0.12 }); this._tone(784, 0.2, { delay: 0.18, vol: 0.12 }); break;
      case 'geodesic': this._tone(1047, 0.4, { vol: 0.1 }); this._tone(1319, 0.5, { delay: 0.12, vol: 0.08 }); break;
      case 'unfold': this._tone(300, 0.35, { type: 'triangle', slide: 500, vol: 0.12 }); break;
      case 'hit': this._tone(140, 0.4, { type: 'sawtooth', slide: -90, vol: 0.18 }); break;
      case 'fall': this._tone(500, 0.7, { type: 'sine', slide: -420, vol: 0.14 }); break;
      case 'lap': this._tone(659, 0.16, { vol: 0.13 }); this._tone(880, 0.25, { delay: 0.1, vol: 0.13 }); break;
      case 'finalLap': for (let i = 0; i < 3; i++) this._tone(880 + i * 110, 0.16, { delay: i * 0.12, vol: 0.13 }); break;
      case 'finish': for (let i = 0; i < 5; i++) this._tone([523, 659, 784, 1047, 1319][i], 0.3, { delay: i * 0.11, vol: 0.13 }); break;
      case 'select': this._tone(740, 0.12, { type: 'triangle', vol: 0.12 }); break;
      case 'back': this._tone(420, 0.12, { type: 'triangle', vol: 0.1 }); break;
    }
  }

  // ── música generativa ──────────────────────────────────────────────
  startMusic(circuitId) {
    if (!this.ctx || !this.enabled) return;
    this.stopMusic();
    const cfg = SCALES[circuitId] ?? SCALES.mobius;
    const stepDur = 60 / cfg.tempo / 2;
    let step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const bar = Math.floor(step / 8);
      // bajo
      if (step % 4 === 0) {
        const root = cfg.notes[(bar % cfg.notes.length)];
        this._tone(cfg.base / 2 * Math.pow(2, root / 12), stepDur * 3.2, { type: cfg.wave, vol: cfg.vol });
      }
      // arpegio
      const ni = (step * 3 + bar) % cfg.notes.length;
      const octave = step % 8 >= 4 ? 2 : 1;
      this._tone(cfg.base * octave * Math.pow(2, cfg.notes[ni] / 12), stepDur * 0.9,
        { type: 'triangle', vol: cfg.vol * 0.7 });
      // percusión: ruido corto
      if (step % 2 === 0) this._noise(step % 8 === 4 ? 0.09 : 0.04, step % 8 === 4 ? 1800 : 6000);
      step++;
    }, stepDur * 1000);
  }

  _noise(dur, freq) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
