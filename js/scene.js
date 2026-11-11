// Canvas scene: the floating crystal cluster, particles, tap text and glimmers.
// The cluster is drawn procedurally and grows as the player buys growths.

import { GENERATORS } from './data.js';
import { SKINS, TAP_FX } from './cosmetics.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** How many crystals of a growth type appear, by amount owned. */
const VISUAL_STEPS = [1, 5, 15, 30, 60, 100, 150];

const CORE = { hue: 188, sat: 60, lig: 74 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A warm rose-gold crystal near the heart of the cluster: a thank-you to players who support the game. */
const SUPPORTER_CRYSTAL = { angle: 11 * DEG, len: 0.44, width: 0.09, ox: 0.05, hue: 338, sat: 96, lig: 70, fixed: true };

/**
 * Build the list of crystals (in cluster units, where 1 = cluster radius) for the current growths.
 * @param {object} gens growth id -> amount owned
 * @param {{skin?: string, supporter?: boolean}} [look] cosmetic choices; they never change the shape
 */
export function composeCluster(gens, look = {}) {
  const crystals = [
    { angle: -4 * DEG, len: 0.5, width: 0.105, ox: 0, ...CORE },
    { angle: -34 * DEG, len: 0.33, width: 0.08, ox: -0.08, ...CORE },
    { angle: 29 * DEG, len: 0.3, width: 0.075, ox: 0.09, ...CORE },
    { angle: 58 * DEG, len: 0.2, width: 0.06, ox: 0.18, ...CORE },
    { angle: -62 * DEG, len: 0.21, width: 0.06, ox: -0.18, ...CORE },
  ];
  GENERATORS.forEach((g, gi) => {
    const have = gens[g.id] || 0;
    const count = VISUAL_STEPS.filter((t) => have >= t).length;
    for (let k = 0; k < count; k++) {
      const rng = mulberry32((gi + 1) * 7919 + k * 104729);
      const spread = (96 - gi * 3.5) * DEG;
      // Bias toward the middle so the tallest crystals form the heart of the cluster.
      const r = rng() * 2 - 1;
      const angle = Math.sign(r) * Math.pow(Math.abs(r), 0.8) * spread;
      const upright = 1 - Math.abs(angle) / (110 * DEG);
      const len = (0.3 + gi * 0.058) * (0.72 + rng() * 0.36) * (0.62 + 0.38 * upright) * (1 + k * 0.012);
      crystals.push({
        angle,
        len,
        width: len * (0.15 + rng() * 0.08),
        ox: Math.sin(angle) * 0.26 * rng() + (rng() - 0.5) * 0.1,
        hue: g.hue + (rng() - 0.5) * 14,
        sat: g.sat,
        lig: g.lig + (rng() - 0.5) * 8,
      });
    }
  });
  const skin = SKINS.find((s) => s.id === look.skin);
  if (skin && skin.id !== 'classic') crystals.forEach((c, i) => Object.assign(c, skin.tint(c, i)));
  if (look.supporter) crystals.push({ ...SUPPORTER_CRYSTAL });
  // Long crystals sit at the back, short ones in front.
  crystals.sort((a, b) => b.len - a.len);
  return crystals;
}

function drawCrystal(ctx, c, R) {
  const len = c.len * R;
  const w = c.width * R;
  const tip = Math.min(w * 1.15, len * 0.36);
  const sh = -(len - tip);
  const ridge = -w * 0.14;
  const { hue: h, sat: s, lig: l } = c;

  ctx.save();
  ctx.translate(c.ox * R, 0);
  ctx.rotate(c.angle);

  const face = (pts, top, bottom) => {
    const grad = ctx.createLinearGradient(0, 0, 0, -len);
    grad.addColorStop(0, bottom);
    grad.addColorStop(1, top);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  // Lit face
  face(
    [[-w / 2, 0], [-w / 2, sh], [0, -len], [ridge, sh], [ridge, 0]],
    `hsla(${h}, ${s}%, ${Math.min(94, l + 22)}%, 0.96)`,
    `hsla(${h}, ${s}%, ${l - 14}%, 0.9)`
  );
  // Shaded face
  face(
    [[ridge, 0], [ridge, sh], [0, -len], [w / 2, sh], [w / 2, 0]],
    `hsla(${h}, ${s}%, ${l + 2}%, 0.96)`,
    `hsla(${h}, ${Math.max(20, s - 10)}%, ${l - 30}%, 0.9)`
  );
  // Inner shine near the tip
  ctx.fillStyle = `hsla(${h}, 100%, 96%, 0.22)`;
  ctx.beginPath();
  ctx.moveTo(-w / 2, sh);
  ctx.lineTo(0, -len);
  ctx.lineTo(ridge, sh);
  ctx.closePath();
  ctx.fill();
  // Ridge highlight and outline
  ctx.lineWidth = Math.max(1, R * 0.006);
  ctx.strokeStyle = `hsla(${h}, 100%, 95%, 0.5)`;
  ctx.beginPath();
  ctx.moveTo(ridge, 0);
  ctx.lineTo(ridge, sh);
  ctx.lineTo(0, -len);
  ctx.stroke();
  ctx.strokeStyle = `hsla(${h}, ${s}%, 88%, 0.28)`;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2, sh);
  ctx.lineTo(0, -len);
  ctx.lineTo(w / 2, sh);
  ctx.lineTo(w / 2, 0);
  ctx.stroke();
  ctx.restore();
}

const ROCK = [
  [-0.459, 0.02], [-0.328, -0.05], [-0.123, -0.08], [0.082, -0.07], [0.312, -0.04], [0.467, 0.03], [0.353, 0.1], [0.238, 0.16], [0.139, 0.25], [0.033, 0.34], [-0.066, 0.24], [-0.18, 0.18], [-0.328, 0.1],
];

function drawRock(ctx, R) {
  const path = () => {
    ctx.beginPath();
    ROCK.forEach(([x, y], i) => (i ? ctx.lineTo(x * R, y * R) : ctx.moveTo(x * R, y * R)));
    ctx.closePath();
  };
  const grad = ctx.createLinearGradient(0, -0.08 * R, 0, 0.34 * R);
  grad.addColorStop(0, '#453a72');
  grad.addColorStop(0.35, '#2a2250');
  grad.addColorStop(1, '#120d26');
  ctx.fillStyle = grad;
  path();
  ctx.fill();
  // Low-poly facets
  ctx.fillStyle = 'rgba(10, 6, 30, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0.082 * R, -0.07 * R);
  ctx.lineTo(0.467 * R, 0.03 * R);
  ctx.lineTo(0.238 * R, 0.16 * R);
  ctx.lineTo(0.04 * R, 0.34 * R);
  ctx.lineTo(0.02 * R, 0.08 * R);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(170, 150, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(-0.459 * R, 0.02 * R);
  ctx.lineTo(-0.123 * R, -0.08 * R);
  ctx.lineTo(0.02 * R, 0.08 * R);
  ctx.lineTo(-0.328 * R, 0.1 * R);
  ctx.closePath();
  ctx.fill();
  // Rim light along the top edge
  ctx.strokeStyle = 'rgba(200, 185, 255, 0.45)';
  ctx.lineWidth = Math.max(1, R * 0.008);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ROCK.slice(0, 6).forEach(([x, y], i) => (i ? ctx.lineTo(x * R, y * R) : ctx.moveTo(x * R, y * R)));
  ctx.stroke();
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.hudInset = 110;
    this.time = 0;
    this.punch = 0;
    this.flash = 0;
    this.zoom = 1;
    this.up = 0.55;
    this.fitted = false;
    this.crystals = composeCluster({});
    this.signature = '';
    this.gens = {};
    this.look = { skin: 'classic', supporter: false };
    this.tapStyle = TAP_FX[0];
    this.sprite = document.createElement('canvas');
    this.spriteDirty = true;
    this.particles = [];
    this.texts = [];
    this.glimmer = null;
    this.motes = Array.from({ length: 34 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      v: 0.006 + Math.random() * 0.016,
      p: Math.random() * TAU,
    }));
    this.twinkles = Array.from({ length: 7 }, () => ({ i: 0, t: Math.random() * 2, dur: 1.2 + Math.random() }));
  }

  resize(hudInset) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sameSize = rect.width === this.W && rect.height === this.H && dpr === this.dpr;
    if (sameSize && (hudInset == null || Math.abs(hudInset - this.hudInset) < 1)) return;
    if (hudInset != null) this.hudInset = hudInset;
    if (sameSize) {
      // Only the HUD changed height (buff chips came or went): ease to the new fit instead of snapping.
      this.layout();
      return;
    }
    this.W = rect.width;
    this.H = rect.height;
    this.dpr = dpr;
    const pw = Math.max(1, Math.round(this.W * dpr));
    const ph = Math.max(1, Math.round(this.H * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.fitted = false; // a resize should snap, not animate
    this.layout();
    this.zoom = 1;
    this.fitted = true;
  }

  /**
   * Fit the cluster to the stage. A young cluster is framed close up and the
   * view eases back as taller crystals grow in.
   */
  layout() {
    const top = this.hudInset;
    const avail = Math.max(120, this.H - top - 40);
    let tallest = 0;
    let widest = 0.5;
    for (const c of this.crystals) {
      tallest = Math.max(tallest, Math.cos(c.angle) * c.len);
      widest = Math.max(widest, Math.abs(c.ox + Math.sin(c.angle) * c.len));
    }
    const up = Math.max(0.55, tallest * 1.03);
    const prev = this.R;
    this.up = up;
    this.R = Math.max(40, Math.min((this.W / 2 - 14) / widest, avail / (up + 0.52), 420));
    this.cx = this.W / 2;
    this.cy = top + (avail - (up + 0.4) * this.R) / 2 + up * this.R;
    if (prev && Math.abs(prev - this.R) > 0.5 && this.fitted) this.zoom = (this.zoom || 1) * (prev / this.R);
    this.spriteDirty = true;
  }

  /** Update the cluster art if the set of visible crystals has changed. */
  setGrowths(gens) {
    const sig = GENERATORS.map((g) => VISUAL_STEPS.filter((t) => (gens[g.id] || 0) >= t).length).join('');
    if (sig === this.signature) return;
    const grew = sig > this.signature && this.signature !== '';
    this.signature = sig;
    this.gens = { ...gens };
    this.crystals = composeCluster(gens, this.look);
    if (this.W) this.layout();
    this.spriteDirty = true;
    if (grew) this.flash = 1;
  }

  /** Apply cosmetic choices: crystal skin, tap effect and the supporter crystal. */
  setLook({ skin = 'classic', tapFx = 'shards', supporter = false } = {}) {
    this.tapStyle = TAP_FX.find((f) => f.id === tapFx) || TAP_FX[0];
    if (skin === this.look.skin && supporter === this.look.supporter) return;
    this.look = { skin, supporter };
    this.crystals = composeCluster(this.gens, this.look);
    if (this.W) this.layout();
    this.spriteDirty = true;
  }

  renderSprite() {
    const R = this.R;
    // Sprite box in cluster units, with the cluster origin at (spriteOx, spriteOy).
    this.spriteW = 2.4;
    this.spriteOx = 1.2;
    this.spriteOy = (this.up || 1.1) + 0.12;
    this.spriteH = this.spriteOy + 0.46;
    this.sprite.width = Math.ceil(this.spriteW * R * this.dpr);
    this.sprite.height = Math.ceil(this.spriteH * R * this.dpr);
    const c = this.sprite.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.spriteW * R, this.spriteH * R);
    c.translate(this.spriteOx * R, this.spriteOy * R);
    // Small crystals hanging beneath the rock
    for (const d of [
      { angle: 172 * DEG, len: 0.17, width: 0.045, ox: -0.17 },
      { angle: 190 * DEG, len: 0.13, width: 0.04, ox: 0.2 },
    ]) {
      c.save();
      c.translate(0, 0.13 * R);
      drawCrystal(c, { ...CORE, lig: 56, ...d }, R);
      c.restore();
    }
    for (const crystal of this.crystals) drawCrystal(c, crystal, R);
    drawRock(c, R);
    // A few studs in front so the crystals look rooted in the rock
    const studs = this.crystals.slice(-3);
    [[-0.27, -24], [0.06, 9], [0.29, 31]].forEach(([ox, deg], i) => {
      const src = studs[i % studs.length];
      c.save();
      c.translate(0, 0.03 * R);
      drawCrystal(c, { ...src, angle: deg * DEG, len: 0.12 + i * 0.02, width: 0.04, ox }, R);
      c.restore();
    });
    this.spriteDirty = false;
  }

  /** Screen position of a crystal tip, for sparkles. */
  tipOf(crystal, scale = 1) {
    return {
      x: this.cx + (crystal.ox + Math.sin(crystal.angle) * crystal.len) * this.R * scale,
      y: this.cy - Math.cos(crystal.angle) * crystal.len * this.R * scale,
    };
  }

  tapFx(x, y, text, big = false) {
    this.punch = 1;
    const fx = this.tapStyle;
    const n = this.reduced ? 2 : big ? 9 : 5;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 140) break;
      const src = this.crystals[Math.floor(Math.random() * this.crystals.length)];
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = (90 + Math.random() * 200) * fx.speed;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 12,
        size: 3 + Math.random() * 5,
        life: 0,
        max: (0.5 + Math.random() * 0.4) * (fx.life || 1),
        hue: fx.hue == null ? src.hue : fx.hue + (Math.random() - 0.5) * (fx.hueSpread || 0),
        lig: fx.lig == null ? src.lig : fx.lig - 14,
        fx,
      });
    }
    if (text) {
      if (this.texts.length > 14) this.texts.shift();
      // Fan successive numbers out to alternate sides so fast taps do not pile into one blob.
      this.textSide = -(this.textSide || 1);
      const reach = Math.min(90, this.W * 0.2);
      const dx = this.textSide * (0.25 + Math.random() * 0.75) * reach;
      this.texts.push({ x: x + dx, y: y - 14 - Math.random() * 18, text, life: 0, max: 0.75, big });
    }
  }

  burst(text, hue = 48) {
    const x = this.cx;
    const y = this.cy - (this.R * (this.up - 0.34)) / 2;
    for (let i = 0; i < (this.reduced ? 6 : 28); i++) {
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 320;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 14,
        size: 4 + Math.random() * 6,
        life: 0,
        max: 0.7 + Math.random() * 0.6,
        hue: hue + (Math.random() - 0.5) * 40,
        lig: 70,
      });
    }
    if (text) this.texts.push({ x, y: y - 30, text, life: 0, max: 1.8, big: true });
    this.flash = 1;
  }

  spawnGlimmer() {
    if (this.glimmer) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const yMin = this.hudInset + 30;
    const yMax = Math.max(yMin + 10, this.cy - this.R * 0.1);
    this.glimmer = { t: 0, dur: 13, dir, y0: yMin + Math.random() * (yMax - yMin), x: -99, y: -99, phase: Math.random() * TAU };
  }

  /** Returns true if a glimmer was under the given point (and removes it). */
  hitGlimmer(x, y) {
    const g = this.glimmer;
    if (!g) return false;
    if (Math.hypot(x - g.x, y - g.y) > 48) return false;
    this.glimmer = null;
    return true;
  }

  frame(dt, view) {
    const ctx = this.ctx;
    if (!this.W || !this.H) return;
    this.time += dt;
    const t = this.time;
    const { W, H, R, cx } = this;
    const res = view.resonance;

    if (this.spriteDirty) this.renderSprite();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Drifting motes
    ctx.fillStyle = 'rgba(190, 220, 255, 0.5)';
    for (const m of this.motes) {
      if (!this.reduced) {
        m.y -= m.v * dt;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      }
      const a = 0.25 + 0.25 * Math.sin(t * 0.9 + m.p);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(m.x * W + Math.sin(t * 0.3 + m.p) * 8, m.y * H, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const bob = this.reduced ? 0 : Math.sin(t * 0.9) * R * 0.03;
    const cy = this.cy + bob;

    // Glow behind the cluster, warmer as resonance builds
    const hue = view.radiance ? 46 : 190 + res * 120;
    const mid = (this.up - 0.34) / 2; // vertical middle of the cluster, in cluster units above the origin
    const half = (this.up + 0.34) / 2;
    const glowR = R * (half * 2.1 + res * 0.25 + this.flash * 0.3);
    const gy = cy - R * mid;
    const glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, glowR);
    glow.addColorStop(0, `hsla(${hue}, 95%, 68%, ${0.26 + res * 0.22 + this.flash * 0.25})`);
    glow.addColorStop(0.5, `hsla(${hue + 30}, 90%, 60%, ${0.08 + res * 0.08})`);
    glow.addColorStop(1, 'hsla(260, 90%, 60%, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - glowR, gy - glowR, glowR * 2, glowR * 2);

    // Soft shadow below the floating rock
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, this.cy + R * 0.45, R * (0.32 - bob / R), R * 0.035, 0, 0, TAU);
    ctx.fill();

    // The cluster itself, with a squash when tapped
    this.zoom += (1 - this.zoom) * Math.min(1, dt * 3.5);
    if (Math.abs(this.zoom - 1) < 0.002) this.zoom = 1;
    const z = this.zoom;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z * (1 + this.punch * 0.05), z * (1 - this.punch * 0.035));
    ctx.drawImage(this.sprite, -this.spriteOx * R, -this.spriteOy * R, this.spriteW * R, this.spriteH * R);
    ctx.restore();

    // Twinkles on crystal tips
    if (!this.reduced) {
      ctx.fillStyle = '#fff';
      for (const tw of this.twinkles) {
        tw.t += dt;
        if (tw.t > tw.dur) {
          tw.t = 0;
          tw.dur = 0.9 + Math.random() * 1.6;
          tw.i = Math.floor(Math.random() * this.crystals.length);
        }
        const crystal = this.crystals[tw.i % this.crystals.length];
        const p = this.tipOf(crystal, z);
        const k = Math.sin((tw.t / tw.dur) * Math.PI);
        const s = Math.min(22, R * 0.05) * k;
        ctx.globalAlpha = k * 0.9;
        ctx.beginPath();
        const py = p.y + bob;
        ctx.moveTo(p.x, py - s);
        ctx.quadraticCurveTo(p.x, py, p.x + s, py);
        ctx.quadraticCurveTo(p.x, py, p.x, py + s);
        ctx.quadraticCurveTo(p.x, py, p.x - s, py);
        ctx.quadraticCurveTo(p.x, py, p.x, py - s);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Shard particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      const shape = p.fx ? p.fx.shape : 'shard';
      p.vy += (p.fx ? p.fx.gravity : 520) * dt;
      if (shape === 'dot') p.vx += Math.sin(t * 3 + p.rot) * 90 * dt; // drift like something light
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = 1 - p.life / p.max;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = `hsl(${p.hue}, 90%, ${Math.min(94, p.lig + 14)}%)`;
      ctx.beginPath();
      if (shape === 'dot') {
        if (p.fx.glow) {
          ctx.globalAlpha *= 0.3;
          ctx.arc(0, 0, p.size * 1.3, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.beginPath();
        }
        ctx.arc(0, 0, p.size * 0.5, 0, TAU);
      } else if (shape === 'star') {
        ctx.rotate(p.rot);
        for (let j = 0; j < 4; j++) {
          const a = (j * Math.PI) / 2;
          ctx.lineTo(Math.cos(a) * p.size * 1.2, Math.sin(a) * p.size * 1.2);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * p.size * 0.35, Math.sin(a + Math.PI / 4) * p.size * 0.35);
        }
        ctx.closePath();
      } else {
        ctx.rotate(p.rot);
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.5, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.5, 0);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Glimmer wisp
    const g = this.glimmer;
    if (g) {
      g.t += dt;
      if (g.t >= g.dur) {
        this.glimmer = null;
      } else {
        const p = g.t / g.dur;
        g.x = g.dir > 0 ? -50 + (W + 100) * p : W + 50 - (W + 100) * p;
        g.y = g.y0 + Math.sin(g.t * 1.9 + g.phase) * 26;
        const pulse = 1 + Math.sin(t * 6) * 0.12;
        const halo = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 46 * pulse);
        halo.addColorStop(0, 'rgba(255, 244, 190, 0.95)');
        halo.addColorStop(0.25, 'rgba(255, 214, 110, 0.55)');
        halo.addColorStop(1, 'rgba(255, 190, 80, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 46 * pulse, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(t * 1.4);
        ctx.fillStyle = '#fffbe6';
        const s = 15 * pulse;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.3, Math.sin(a + Math.PI / 4) * s * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Floating numbers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.life += dt;
      if (f.life >= f.max) { this.texts.splice(i, 1); continue; }
      const k = f.life / f.max;
      const size = f.big ? Math.min(40, Math.max(22, W * 0.065)) : Math.min(28, Math.max(16, W * 0.045));
      ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = f.y - k * (f.big ? 46 : 62);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(14, 8, 40, 0.75)';
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.big ? '#ffe9a8' : '#eafcff';
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;

    this.punch = Math.max(0, this.punch - dt * 7);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }
}
