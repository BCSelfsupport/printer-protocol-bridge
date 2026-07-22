/**
 * Fleet Defaults — per-installation overrides for the fleet-wide message
 * adjust defaults (Width / Height / Delay / Bold / Gap / Pitch / Speed).
 *
 * Different customers want different baselines (e.g. this fleet wants W=2 /
 * D=500 / Ultra Fast; another might want W=5 / D=200 / Fastest). The BestCode
 * firmware has no remote command to change the printer's own default table,
 * so CodeSync must push these values after every ^NM and ^SM to overwrite
 * the printer's baked-in W=15 / D=100 defaults.
 *
 * The hard-coded FLEET_DEFAULT_ADJUST_SETTINGS in `@/types/printer` is the
 * factory fallback. This module lets an admin override those values from the
 * Fleet Defaults dialog. Rotation is intentionally excluded — it is always
 * driven by the per-printer Setup Card.
 */

import { useEffect, useState } from 'react';
import { FLEET_DEFAULT_ADJUST_SETTINGS, Printer, PrintSettings } from '@/types/printer';

const STORAGE_KEY = 'codesync.fleetDefaults.v1';
const CHANGE_EVENT = 'codesync:fleet-defaults-changed';

export type FleetDefaultsOverride = Pick<
  PrintSettings,
  'width' | 'height' | 'delay' | 'bold' | 'gap' | 'pitch' | 'speed'
>;

const readOverrides = (): Partial<FleetDefaultsOverride> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<FleetDefaultsOverride>;
  } catch {
    return {};
  }
};

const merge = (overrides: Partial<FleetDefaultsOverride>): PrintSettings => ({
  ...FLEET_DEFAULT_ADJUST_SETTINGS,
  ...overrides,
});

/** Synchronous read — safe to call outside React. */
export const getFleetDefaults = (): PrintSettings => merge(readOverrides());

/** Persist a full override set and notify all subscribers. */
export const setFleetDefaults = (next: FleetDefaultsOverride): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // localStorage full / private mode — silent fail, next boot falls back
  }
};

/** Reset back to hard-coded factory fallback. */
export const resetFleetDefaults = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
};

/** Are the current defaults customized, or still factory? */
export const hasCustomFleetDefaults = (): boolean => {
  return Object.keys(readOverrides()).length > 0;
};

/** React hook — live-updates when the defaults change anywhere in the app. */
export const useFleetDefaults = (): PrintSettings => {
  const [value, setValue] = useState<PrintSettings>(() => getFleetDefaults());

  useEffect(() => {
    const refresh = () => setValue(getFleetDefaults());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return value;
};

/**
 * Resolve the NEW-message defaults for a specific printer.
 * Priority: per-printer overrides (Setup Card) → fleet defaults → factory.
 * Rotation is intentionally NOT included here — it's read from the printer's
 * own `rotation` field by the message pipeline.
 */
export const getPrinterMessageDefaults = (printer?: Printer | null): PrintSettings => {
  const fleet = getFleetDefaults();
  const per = printer?.messageDefaults ?? {};
  return {
    ...fleet,
    width: per.width ?? fleet.width,
    height: per.height ?? fleet.height,
    delay: per.delay ?? fleet.delay,
    bold: per.bold ?? fleet.bold,
    gap: per.gap ?? fleet.gap,
    pitch: per.pitch ?? fleet.pitch,
    speed: per.speed ?? fleet.speed,
  };
};
