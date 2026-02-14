/**
 * Filter tracking based on pump (stream) hours from ^TM command.
 *
 * Each printer can have a configured filter life (in pump hours).
 * When the filter is replaced, the user records the current pump hours.
 * The tracker calculates remaining hours and predicts the next change date.
 */

const FILTER_CONFIG_KEY = 'codesync-filter-config';

export interface FilterConfig {
  printerId: number;
  /** Total filter life in pump hours */
  filterLifeHours: number;
  /** Pump hours reading when filter was last replaced */
  lastReplacedAtPumpHours: number;
  /** ISO timestamp of the last replacement */
  lastReplacedDate: string;
}

function loadConfigs(): FilterConfig[] {
  try {
    const raw = localStorage.getItem(FILTER_CONFIG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConfigs(configs: FilterConfig[]) {
  try {
    localStorage.setItem(FILTER_CONFIG_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error('[filterTracker] save failed:', e);
  }
}

/** Get filter config for a printer. */
export function getFilterConfig(printerId: number): FilterConfig | null {
  return loadConfigs().find(c => c.printerId === printerId) ?? null;
}

/** Get all filter configs. */
export function getAllFilterConfigs(): FilterConfig[] {
  return loadConfigs();
}

/** Set or update filter config for a printer. */
export function setFilterConfig(config: FilterConfig) {
  const configs = loadConfigs();
  const idx = configs.findIndex(c => c.printerId === config.printerId);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  saveConfigs(configs);
}

/** Record a filter replacement at the current pump hours. */
export function recordFilterReplacement(printerId: number, currentPumpHours: number, filterLifeHours: number) {
  setFilterConfig({
    printerId,
    filterLifeHours,
    lastReplacedAtPumpHours: currentPumpHours,
    lastReplacedDate: new Date().toISOString(),
  });
}

/** Remove filter config for a printer. */
export function removeFilterConfig(printerId: number) {
  const configs = loadConfigs().filter(c => c.printerId !== printerId);
  saveConfigs(configs);
}

// ── Status calculation ──

export interface FilterStatus {
  printerId: number;
  config: FilterConfig;
  /** Current pump hours */
  currentPumpHours: number;
  /** Hours used since last replacement */
  hoursUsed: number;
  /** Hours remaining before filter change needed */
  hoursRemaining: number;
  /** Percentage of filter life used */
  percentUsed: number;
  /** Estimated days until filter change, based on pump hour accumulation rate */
  estimatedDaysRemaining: number | null;
  /** Status level */
  status: 'ok' | 'warning' | 'critical';
}

/**
 * Calculate filter status given current pump hours from ^TM.
 * Optionally provide pump hour accumulation rate (hours per day) for time prediction.
 */
export function getFilterStatus(
  printerId: number,
  currentPumpHours: number,
  pumpHoursPerDay?: number,
): FilterStatus | null {
  const config = getFilterConfig(printerId);
  if (!config) return null;

  const hoursUsed = Math.max(0, currentPumpHours - config.lastReplacedAtPumpHours);
  const hoursRemaining = Math.max(0, config.filterLifeHours - hoursUsed);
  const percentUsed = config.filterLifeHours > 0
    ? Math.min(100, Math.round((hoursUsed / config.filterLifeHours) * 100))
    : 100;

  // Estimate days remaining if we know the accumulation rate
  let estimatedDaysRemaining: number | null = null;
  if (pumpHoursPerDay && pumpHoursPerDay > 0) {
    estimatedDaysRemaining = Math.round(hoursRemaining / pumpHoursPerDay);
  } else {
    // Fallback: estimate from time elapsed since replacement
    const daysSinceReplacement = Math.max(
      1,
      (Date.now() - new Date(config.lastReplacedDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (hoursUsed > 0) {
      const ratePerDay = hoursUsed / daysSinceReplacement;
      estimatedDaysRemaining = ratePerDay > 0 ? Math.round(hoursRemaining / ratePerDay) : null;
    }
  }

  const status: FilterStatus['status'] =
    percentUsed >= 90 ? 'critical' :
    percentUsed >= 70 ? 'warning' : 'ok';

  return {
    printerId,
    config,
    currentPumpHours,
    hoursUsed,
    hoursRemaining,
    percentUsed,
    estimatedDaysRemaining,
    status,
  };
}

/**
 * Parse pump hours from the ^TM response string.
 * Verbose: "Power: 165:00 hours\nPump:    98:17 hours"
 * or "Power Hours: 165.0\nStream Hours: 120.5"
 * Terse: "PWR[165.0] STR[120.5]"
 */
export function parsePumpHours(tmResponse: string): number | null {
  // Try verbose "Pump: HH:MM hours" format
  const pumpMatch = tmResponse.match(/Pump\s*:\s*([\d]+):([\d]+)/i);
  if (pumpMatch) {
    return parseInt(pumpMatch[1], 10) + parseInt(pumpMatch[2], 10) / 60;
  }

  // Try "Stream Hours: N.N" format
  const streamMatch = tmResponse.match(/Stream\s*Hours?\s*:\s*([\d.]+)/i);
  if (streamMatch) {
    return parseFloat(streamMatch[1]);
  }

  // Try terse "STR[N.N]" format
  const strMatch = tmResponse.match(/STR\[\s*([\d.]+)\s*\]/i);
  if (strMatch) {
    return parseFloat(strMatch[1]);
  }

  return null;
}

/**
 * Parse power hours from ^TM response (for display).
 */
export function parsePowerHours(tmResponse: string): number | null {
  const pwrMatch = tmResponse.match(/Power\s*:\s*([\d]+):([\d]+)/i);
  if (pwrMatch) {
    return parseInt(pwrMatch[1], 10) + parseInt(pwrMatch[2], 10) / 60;
  }

  const pwrHoursMatch = tmResponse.match(/Power\s*Hours?\s*:\s*([\d.]+)/i);
  if (pwrHoursMatch) {
    return parseFloat(pwrHoursMatch[1]);
  }

  const pwrTerseMatch = tmResponse.match(/PWR\[\s*([\d.]+)\s*\]/i);
  if (pwrTerseMatch) {
    return parseFloat(pwrTerseMatch[1]);
  }

  return null;
}
