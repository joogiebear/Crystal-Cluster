// Tiny synthesised sound set. Everything is generated with Web Audio, so there are no files to load.

const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];
const ROOT = 523.25; // C5

export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.out = null;
    this.lastTap = 0;
  }

  /** Must be called from a user gesture (iOS will not start audio otherwise). */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const master = this.ctx.createGain();
        master.gain.value = 0.22;
        master.connect(this.ctx.destination);
        // A soft echo gives the chimes a cavern feel.
        const delay = this.ctx.createDelay(0.5);
        delay.delayTime.value = 0.19;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.28;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.35;
        master.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(this.ctx.destination);
        this.out = master;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (on && this.ctx) this.ctx.resume();
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  chime(freq, { at = 0, vol = 0.5, dur = 0.4, type = 'sine' } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.connect(this.out);
    for (const [mult, level] of [[1, 1], [2.76, 0.28]]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult;
      g.gain.value = level;
      osc.connect(g);
      g.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  tap(resonance = 0) {
    if (!this.ready) return;
    const now = performance.now();
    if (now - this.lastTap < 45) return;
    this.lastTap = now;
    const i = Math.min(SCALE.length - 1, Math.floor(resonance * 6) + Math.floor(Math.random() * 4));
    this.chime(ROOT * SCALE[i], { vol: 0.35, dur: 0.32 });
  }

  buy() {
    this.chime(ROOT * 0.5 * SCALE[2], { vol: 0.4, dur: 0.25, type: 'triangle' });
    this.chime(ROOT * 0.5 * SCALE[5], { at: 0.07, vol: 0.4, dur: 0.35, type: 'triangle' });
  }

  upgrade() {
    [0, 2, 3, 5].forEach((n, k) => this.chime(ROOT * SCALE[n], { at: k * 0.06, vol: 0.4, dur: 0.5 }));
  }

  glimmer() {
    [5, 7, 8, 10].forEach((n, k) => this.chime(ROOT * SCALE[n], { at: k * 0.05, vol: 0.38, dur: 0.7 }));
  }

  deny() {
    this.chime(180, { vol: 0.25, dur: 0.12, type: 'triangle' });
  }

  shatter() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const g = this.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.out);
    src.start(t);
    [10, 8, 7, 5, 3, 2, 0].forEach((n, k) => this.chime(ROOT * SCALE[n], { at: 0.05 + k * 0.07, vol: 0.4, dur: 0.9 }));
  }
}
