// ============================================================
// AI ERA — synthesized sound engine (Web Audio API)
// No external files; everything is generated on the fly.
// ============================================================
class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
    this.muted = localStorage.getItem('aiera_muted') === '1';
    this._laser = null;   // {osc, gain, noise} continuous laser hum
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 28; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.ready = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) {
    this.muted = m;
    localStorage.setItem('aiera_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- low-level helpers ----
  _noiseBuffer(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  // tonal blip with pitch glide + percussive envelope
  blip(type, f0, f1, dur, vol, t0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx; t0 = t0 || ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // filtered noise burst (explosions, crackle)
  burst(dur, vol, filterType, fStart, fEnd, q, t0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx; t0 = t0 || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuffer(dur);
    const f = ctx.createBiquadFilter(); f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(fStart, t0);
    if (fEnd) f.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t0 + dur);
    if (q) f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ---- game sounds ----
  fire(kind) {
    if (kind === 'base') { this.blip('square', 360, 110, 0.13, 0.22); this.burst(0.05, 0.12, 'highpass', 1800, 600); }
    else if (kind === 'cannon') { this.blip('sawtooth', 180, 55, 0.18, 0.28); this.blip('sine', 90, 40, 0.22, 0.22); }
    else if (kind === 'turret') { this.blip('square', 560, 320, 0.05, 0.10); }
    else this.blip('square', 480, 260, 0.06, 0.10);
  }
  tesla() {
    this.burst(0.14, 0.22, 'bandpass', 2400, 900, 7);
    this.blip('square', 1300, 420, 0.09, 0.10);
  }
  explode(kind) {
    if (kind === 'boss') {
      this.burst(0.8, 0.5, 'lowpass', 1600, 120);
      this.blip('sine', 80, 28, 0.9, 0.45);
      this.blip('triangle', 220, 60, 0.5, 0.2);
    } else if (kind === 'big') {
      this.burst(0.45, 0.38, 'lowpass', 1400, 160);
      this.blip('sine', 95, 38, 0.45, 0.3);
    } else {
      this.burst(0.26, 0.26, 'lowpass', 1300, 220);
      this.blip('sine', 130, 52, 0.22, 0.18);
    }
  }
  baseHit(intensity) {
    const v = Math.min(0.4, 0.16 + intensity * 0.02);
    this.burst(0.22, v, 'lowpass', 900, 140);
    this.blip('sawtooth', 200, 70, 0.16, v * 0.7);
  }
  shieldUp() { this.blip('sine', 300, 760, 0.26, 0.2); this.blip('triangle', 600, 1100, 0.26, 0.08); }
  shieldDown() { this.blip('sine', 700, 240, 0.22, 0.16); }
  shieldImpact() { this.blip('triangle', 1000, 560, 0.08, 0.10); }
  shieldBreak() { this.burst(0.4, 0.3, 'bandpass', 1400, 300, 3); this.blip('sawtooth', 520, 70, 0.4, 0.2); }
  upgrade() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    [523, 659, 784, 1047].forEach((f, i) => this.blip('triangle', f, f, 0.16, 0.16, t + i * 0.08));
  }
  wave() { const t = this.ctx ? this.ctx.currentTime : 0; this.blip('sawtooth', 180, 180, 0.18, 0.16, t); this.blip('sawtooth', 240, 240, 0.18, 0.16, t + 0.16); }
  build() { this.blip('square', 420, 760, 0.1, 0.14); }
  click() { this.blip('square', 700, 700, 0.03, 0.07); }
  deny() { this.blip('square', 200, 140, 0.12, 0.14); }
  victory() { const t = this.ctx ? this.ctx.currentTime : 0; [523, 659, 784, 1047, 1319].forEach((f, i) => this.blip('triangle', f, f, 0.3, 0.18, t + i * 0.12)); }
  gameover() { const t = this.ctx ? this.ctx.currentTime : 0; [400, 330, 262, 196].forEach((f, i) => this.blip('sawtooth', f, f * 0.96, 0.4, 0.2, t + i * 0.18)); }

  // continuous laser hum, toggled on/off as turrets fire
  setLaser(on) {
    if (!this.ready) return;
    if (on && !this._laser) {
      if (this.muted) { this._laser = { muted: true }; return; }
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 116;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 232;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.05);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this._laser = { o, o2, g };
    } else if (!on && this._laser) {
      if (!this._laser.muted) {
        const l = this._laser, t = this.ctx.currentTime;
        l.g.gain.setTargetAtTime(0.0001, t, 0.05);
        l.o.stop(t + 0.2); l.o2.stop(t + 0.2);
      }
      this._laser = null;
    }
  }
}
