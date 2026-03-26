/**
 * AutoCode ↔ Protocol mapping and live-value computation.
 *
 * Protocol v2.6 references:
 *   §5.33.2.3 ^AD – date type codes (d=1..22)
 *   §5.33.2.5 ^AH – time type codes (t=1..7 / 23..29)
 *   §5.33.2.7 ^AP – program date/time (reuses same d/t codes)
 *   §5.33.2.4 ^AE – extended date (expiry / rollover)
 */

// ── Protocol date type codes (v2.6 §5.33.2.3) ──────────────────────────────

/** Map from UI date code id → protocol d= value for ^AD / ^AE / ^AP */
export const DATE_CODE_TO_PROTOCOL: Record<string, number> = {
  // Individual date component codes
  'dow_num':      1,   // Day of week, numeric
  'dow_alpha':    2,   // Day of week, alphabetic
  'dom':          3,   // Day of month
  'doy':          4,   // Day of year (DDD)
  'ww':           5,   // Week number
  'mm':           6,   // Month number
  'alpha_month':  7,   // Month, alphabetic
  'y':            8,   // Year (1 digit)
  'yy':           9,   // Year (2 digits)
  'yyyy':         10,  // Year (4 digits)
  // Full date format codes
  'MMDDYY':       11,  // Month, Day, 2-digit Year, no delimiters
  'MM/DD/YY':     12,  // Month, Day, 2-digit Year, with delimiters
  'DDMMYY':       13,  // Day, Month, 2-digit Year, no delimiters
  'DD/MM/YY':     14,  // Day, Month, 2-digit Year, with delimiters
  'YYMMDD':       15,  // 2-digit Year, Month, Day, no delimiters
  'YY/MM/DD':     16,  // 2-digit Year, Month, Day, with delimiters
  'MMDDYYYY':     17,  // Month, Day, 4-digit Year, no delimiters
  'MM/DD/YYYY':   18,  // Month, Day, 4-digit Year, with delimiters
  'DDMMYYYY':     19,  // Day, Month, 4-digit Year, no delimiters
  'DD/MM/YYYY':   20,  // Day, Month, 4-digit Year, with delimiters
  'YYYYMMDD':     21,  // 4-digit Year, Month, Day, no delimiters
  'YYYY/MM/DD':   22,  // 4-digit Year, Month, Day, with delimiters
};

/** Map UI dash/dot-delimited date formats to their slash-delimited protocol equivalents */
const DATE_FORMAT_ALIASES: Record<string, string> = {
  'MM-DD-YY': 'MM/DD/YY',
  'DD-MM-YY': 'DD/MM/YY',
  'YY-MM-DD': 'YY/MM/DD',
  'MM.DD.YY': 'MM/DD/YY',
  'DD.MM.YY': 'DD/MM/YY',
};

// ── Protocol time type codes (v2.6 §5.33.2.5) ──────────────────────────────

/** Map from UI time format → protocol t= value for ^AH / ^AP */
export const TIME_CODE_TO_PROTOCOL: Record<string, number> = {
  'SS':       25,  // Seconds only
  'MM':       24,  // Minutes only  (the time MM, not month)
  'HH':       23,  // Hours only
  'HHMM':     26,  // Hours and minutes (no delimiter)
  'HH:MM':    26,  // treated same — delimiter controlled by ^CH
  'HHMMSS':   27,  // Hours, minutes, seconds (no delimiter)
  'HH:MM:SS': 27,  // treated same
  'MM:SS':    27,  // closest match: full HMS with delimiters
};

// ── Reverse mapping (protocol code → format string for preview) ─────────────

export const PROTOCOL_DATE_TO_FORMAT: Record<number, string> = {};
for (const [fmt, code] of Object.entries(DATE_CODE_TO_PROTOCOL)) {
  PROTOCOL_DATE_TO_FORMAT[code] = fmt;
}

// ── Individual date code types (used in DateCodesDialog Year/Month/Week submenus) ──

/** All individual code type ids that are "program" variants → use ^AP instead of ^AD */
export function isProgram(codeType: string): boolean {
  return codeType.startsWith('program_');
}

/** Strip "program_" prefix to get the base code type for protocol lookup */
export function baseCodeType(codeType: string): string {
  return codeType.replace(/^program_/, '');
}

// ── Determine protocol command and date/time type code ──────────────────────

export interface ProtocolFieldInfo {
  /** ^AD, ^AE, ^AH, or ^AP */
  command: 'AD' | 'AE' | 'AH' | 'AP';
  /** The d= or t= parameter */
  typeCode: number;
  /** Optional expiry/rollover suffix params */
  extParams?: string;
}

/**
 * Given an autoCodeFieldType (e.g. 'date_normal_doy', 'date_expiry_yyyy', 'time',
 * 'program_hour') and optional format/expiry info, return the protocol command + type code.
 */
export function getProtocolFieldInfo(
  autoCodeFieldType: string,
  autoCodeFormat?: string,
  autoCodeExpiryDays?: number,
): ProtocolFieldInfo | null {
  // --- Time fields ---
  if (autoCodeFieldType === 'time') {
    const fmt = autoCodeFormat || 'HH:MM:SS';
    return { command: 'AH', typeCode: TIME_CODE_TO_PROTOCOL[fmt] ?? 27 };
  }
  if (autoCodeFieldType === 'program_hour') {
    return { command: 'AP', typeCode: 23 };
  }
  if (autoCodeFieldType === 'program_minute') {
    return { command: 'AP', typeCode: 24 };
  }
  if (autoCodeFieldType === 'program_second') {
    return { command: 'AP', typeCode: 25 };
  }

  // --- Date fields: date_{dateType}[_{codeType}] ---
  if (!autoCodeFieldType.startsWith('date_')) return null;

  const parts = autoCodeFieldType.split('_');
  const dateType = parts[1]; // normal, expiry, rollover, expiry_rollover
  const codeType = parts.slice(2).join('_'); // yyyy, doy, program_doy, etc.

  const useExpiry = dateType === 'expiry' || dateType === 'expiry_rollover';
  const useRollover = dateType === 'rollover' || dateType === 'expiry_rollover';

  // Build expiry/rollover extension params for ^AE / ^AP
  let extParams = '';
  if (useExpiry && autoCodeExpiryDays) {
    extParams += `;D${autoCodeExpiryDays}`;
  }
  // Parse rollover from format string
  if (useRollover && autoCodeFormat) {
    const rollMatch = autoCodeFormat.match(/\|rollover:(\d+)/);
    if (rollMatch) extParams += `;R${rollMatch[1]}`;
  }

  if (codeType) {
    // Individual code type (year, month, week codes)
    const prog = isProgram(codeType);
    const base = baseCodeType(codeType);

    // "julian" (YDDD) is a composite not in the protocol — send as text with computed value
    if (base === 'julian') {
      return null; // Caller should fall back to ^AT (text field)
    }

    const typeCode = DATE_CODE_TO_PROTOCOL[base];
    if (typeCode === undefined) return null;

    if (prog) {
      return { command: 'AP', typeCode, extParams: extParams || undefined };
    }
    if (useExpiry || useRollover) {
      return { command: 'AE', typeCode, extParams: extParams || undefined };
    }
    return { command: 'AD', typeCode };
  }

  // Full date format (e.g. 'MM/DD/YY') — extract from autoCodeFormat
  if (autoCodeFormat) {
    const cleanFmt = autoCodeFormat.split('|')[0]; // strip |expiry:... |rollover:...
    const canonicalFmt = DATE_FORMAT_ALIASES[cleanFmt] || cleanFmt;
    const typeCode = DATE_CODE_TO_PROTOCOL[canonicalFmt];
    if (typeCode !== undefined) {
      if (useExpiry || useRollover) {
        return { command: 'AE', typeCode, extParams: extParams || undefined };
      }
      return { command: 'AD', typeCode };
    }
  }

  // Fallback: date type 12 (MM/DD/YY with delimiters)
  return { command: 'AD', typeCode: 12 };
}


// ── Live preview value computation ──────────────────────────────────────────

/**
 * Compute the live display value for an auto-code field given current time.
 */
export function computeAutoCodeValue(
  autoCodeFieldType: string,
  autoCodeFormat: string | undefined,
  now: Date,
  expiryDays?: number,
): string | null {
  // --- Time ---
  if (autoCodeFieldType === 'time' && autoCodeFormat) {
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    switch (autoCodeFormat) {
      case 'HH:MM:SS': return `${h}:${m}:${s}`;
      case 'HH:MM': return `${h}:${m}`;
      case 'HH': return h;
      case 'MM:SS': return `${m}:${s}`;
      case 'MM': return m;
      case 'SS': return s;
      default: return `${h}:${m}:${s}`;
    }
  }
  if (autoCodeFieldType === 'program_hour') {
    return now.getHours().toString().padStart(2, '0');
  }
  if (autoCodeFieldType === 'program_minute') {
    return now.getMinutes().toString().padStart(2, '0');
  }
  if (autoCodeFieldType === 'program_second') {
    return now.getSeconds().toString().padStart(2, '0');
  }

  // --- Date ---
  if (!autoCodeFieldType.startsWith('date_')) return null;

  const parts = autoCodeFieldType.split('_');
  const codeType = parts.slice(2).join('_'); // may be empty for full-format dates

  // Apply expiry offset
  const d = new Date(now.getTime());
  if (expiryDays && expiryDays > 0) d.setDate(d.getDate() + expiryDays);

  if (codeType) {
    return getDateCodeValue(codeType, d);
  }

  // Full date format
  if (autoCodeFormat) {
    const cleanFmt = autoCodeFormat.split('|')[0];
    return formatFullDate(cleanFmt, d);
  }

  return null;
}

/** Compute individual date code value */
function getDateCodeValue(codeType: string, d: Date): string {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const dayOfYear = Math.floor(
    (Date.UTC(year, d.getMonth(), day) - Date.UTC(year, 0, 0)) / 86400000
  );
  const weekNum = Math.ceil(dayOfYear / 7);
  const dayOfWeek = d.getDay() || 7;
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // Strip "program_" prefix — computed value is the same (current date/time),
  // the difference is only in the protocol command (^AP vs ^AD).
  const base = codeType.replace(/^program_/, '');

  switch (base) {
    case 'yyyy': return year.toString();
    case 'yy': return year.toString().slice(-2);
    case 'y': return year.toString().slice(-1);
    case 'doy': return dayOfYear.toString().padStart(3, '0');
    case 'julian': return `${year.toString().slice(-1)}${dayOfYear.toString().padStart(3, '0')}`;
    case 'mm': return month.toString().padStart(2, '0');
    case 'alpha_month': return monthNames[month - 1];
    case 'dom': return day.toString().padStart(2, '0');
    case 'ww': return weekNum.toString().padStart(2, '0');
    case 'dow_num': return dayOfWeek.toString();
    case 'dow_alpha': return dayNames[d.getDay()];
    default: return base.toUpperCase();
  }
}

/** Format a full date string from a format template */
function formatFullDate(format: string, d: Date): string {
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const yearShort = d.getFullYear().toString().slice(-2);
  const yearFull = d.getFullYear().toString();

  switch (format) {
    case 'MMDDYY': return `${month}${day}${yearShort}`;
    case 'DDMMYY': return `${day}${month}${yearShort}`;
    case 'YYMMDD': return `${yearShort}${month}${day}`;
    case 'MM/DD/YY': return `${month}/${day}/${yearShort}`;
    case 'DD/MM/YY': return `${day}/${month}/${yearShort}`;
    case 'YY/MM/DD': return `${yearShort}/${month}/${day}`;
    case 'MM-DD-YY': return `${month}-${day}-${yearShort}`;
    case 'DD-MM-YY': return `${day}-${month}-${yearShort}`;
    case 'YY-MM-DD': return `${yearShort}-${month}-${day}`;
    case 'MM.DD.YY': return `${month}.${day}.${yearShort}`;
    case 'DD.MM.YY': return `${day}.${month}.${yearShort}`;
    case 'MMDDYYYY': return `${month}${day}${yearFull}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${yearFull}`;
    case 'DDMMYYYY': return `${day}${month}${yearFull}`;
    case 'DD/MM/YYYY': return `${day}/${month}/${yearFull}`;
    case 'YYYYMMDD': return `${yearFull}${month}${day}`;
    case 'YYYY/MM/DD': return `${yearFull}/${month}/${day}`;
    default: return `${month}/${day}/${yearShort}`;
  }
}
