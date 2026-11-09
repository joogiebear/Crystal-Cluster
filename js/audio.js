// Tiny synthesised sound set. Everything is generated with Web Audio, so there are no files to load.

const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];
const ROOT = 523.25; // C5

/**
 * Ambient soundscapes: a slow pad of a few detuned voices, with the odd bell note over the top.
 * root is in Hz; chord and bells are frequency ratios above it; every is the gap between bells in seconds.
 */
const SOUNDSCAPES = {
  cavern: { root: 130.81, chord: [1, 1.5, 2, 3], bells: [4, 4.5, 5, 6, 7.5, 8], every: [5, 11], wave: 'sine', cutoff: 620, level: 0.2 },
  tide: { root: 110, chord: [1, 1.2, 1.5, 1.8, 2], bells: [4, 4.8, 6, 7.2, 8], every: [7, 14], wave: 'triangle', cutoff: 420, level: 0.2 },
  starfield: { root: 146.83, chord: [1, 1.25, 1.5, 1.875, 3], bells: [6, 7.5, 8, 10, 11.25, 12], every: [3, 8], wave: 'sine', cutoff: 900, level: 0.16 },
};

export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.out = null;
    this.lastTap = 0;
    this.music = 'off'; // wanted soundscape id
    this.playing = null; // { id, gain, nodes, timer } for the one that is sounding
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
      this.syncMusic();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (on && this.ctx) this.ctx.resume();
  }

  // ---------- Ambient soundscape ----------

  /** Choose a soundscape by id ('off' for silence). It starts once audio is unlocked by a tap. */
  setMusic(id) {
    this.music = SOUNDSCAPES[id] ? id : 'off';
    this.syncMusic();
  }

  syncMusic() {
    if (!this.ctx || !this.out) return;
    if (this.playing && this.playing.id !== this.music) this.stopMusic();
    if (this.music !== 'off' && !this.playing) this.startMusic(this.music);
  }

  startMusic(id) {
    const def = SOUNDSCAPES[id];
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(def.level, t + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = def.cutoff;
    filter.connect(gain);
    gain.connect(this.out);
    const nodes = [];
    def.chord.forEach((ratio, i) => {
      // Two slightly detuned oscillators per voice, each swelling at its own slow pace.
      const voice = ctx.createGain();
      voice.gain.value = 0.5 / def.chord.length;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.04 + i * 0.017;
      depth.gain.value = 0.35 / def.chord.length;
      lfo.connect(depth);
      depth.connect(voice.gain);
      lfo.start(t);
      nodes.push(lfo);
      for (const cents of [-5, 6]) {
        const osc = ctx.createOscillator();
        osc.type = def.wave;
        osc.frequency.value = def.root * ratio;
        osc.detune.value = cents;
        osc.connect(voice);
        osc.start(t);
        nodes.push(osc);
      }
      voice.connect(filter);
    });
    const playing = { id, gain, nodes, timer: 0 };
    const bell = () => {
      const [lo, hi] = def.every;
      playing.timer = setTimeout(bell, (lo + Math.random() * (hi - lo)) * 1000);
      if (document.hidden) return;
      const ratio = def.bells[Math.floor(Math.random() * def.bells.length)];
      this.chime(def.root * ratio, { vol: 0.09, dur: 3.2 });
    };
    playing.timer = setTimeout(bell, 2500);
    this.playing = playing;
  }

  stopMusic() {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    clearTimeout(p.timer);
    const t = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), t);
    p.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    for (const n of p.nodes) n.stop(t + 1.3);
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
