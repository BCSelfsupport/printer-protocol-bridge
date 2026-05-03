/**
 * Twin Code — shared number/duration formatters.
 * Keep visual scannability consistent across HUD, ribbon, and toasts.
 */

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export function fmtRate(perMin: number | null | undefined): string {
  if (perMin == null || !Number.isFinite(perMin)) return "—/min";
  return `${Math.round(perMin)}/min`;
}

/** Compact duration: 3,724s → "1h 2m", 142s → "2m 22s", 9s → "9s" */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

/** ETA in compact form, given remaining count and rate per minute. */
export function fmtEta(remaining: number, ratePerMin: number): string {
  if (!ratePerMin || ratePerMin <= 0 || remaining <= 0) return "—";
  return fmtDuration((remaining / ratePerMin) * 60);
}

export function fmtPct(pct: number | null | undefined, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(digits)}%`;
}
