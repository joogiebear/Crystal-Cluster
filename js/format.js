// Number and time formatting helpers.

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * Format a number for display. Values are truncated, never rounded up,
 * so the player is never shown more than they actually have.
 * @param {number} n
 * @param {boolean} [small] show one decimal for fractional values below 100
 */
export function fmt(n, small = false) {
  if (Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n, small);
  if (n < 1000) {
    if (small && n < 100 && n % 1 !== 0) return (Math.floor(n * 10 + 1e-9) / 10).toFixed(1);
    return String(Math.floor(n + 1e-9));
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
  const v = n / Math.pow(10, tier * 3);
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const f = Math.pow(10, digits);
  return (Math.floor(v * f + 1e-9) / f).toFixed(digits) + SUFFIXES[tier];
}

/** Format a duration in seconds as a short human string. */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
