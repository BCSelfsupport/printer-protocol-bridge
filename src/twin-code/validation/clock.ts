// Timestamps for validation reports and traffic logs.
//
// Rule: a validation log is filed against the operator's wall clock, so every
// stamp must come from the PC's own clock in the PC's own time zone — never UTC.
// (UTC stamps read as being hours out of place and make a filed log ambiguous.)

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Time of day on the PC clock, e.g. "14:21:07.412". */
export function localTime(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Time zone the PC is reporting, e.g. "America/New_York (UTC-04:00)". */
export function localTimeZone(d: Date = new Date()): string {
  let zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    zone = "";
  }
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const utc = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return zone ? `${zone} (${utc})` : utc;
}

/** Full date, time and zone on the PC clock, e.g. "13/10/2026 14:21:07.412 America/New_York (UTC-04:00)". */
export function localDateTime(d: Date = new Date()): string {
  return `${d.toLocaleDateString()} ${localTime(d)} ${localTimeZone(d)}`;
}

/** Date only on the PC clock, e.g. "13/10/2026". */
export function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString();
}

/** File-name stamp from the PC clock, e.g. "2026-10-13_14-21-07". */
export function fileStamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
