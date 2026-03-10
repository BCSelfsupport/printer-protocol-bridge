/**
 * Factory-default messages hardcoded in BestCode printers.
 * These cannot be deleted from the printer and are mirrored here
 * so the editor can display them without fetching field data.
 *
 * Model 82/86/88: "BestCode" and "BestCode auto"
 * Quantum (Q/Qx): TBD — not yet defined.
 */

import type { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';
import type { MessageSettings } from '@/components/messages/MessageSettingsDialog';
import type { AdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';
import { defaultAdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';

// ─── Field definitions ──────────────────────────────────────────────────────

const BESTCODE_FIELDS: MessageField[] = [
  {
    id: 1,
    type: 'text',
    data: 'BestCode',
    x: 0,
    y: 0,
    width: 128,
    height: 16,
    fontSize: 'Standard16High',
  },
  {
    id: 2,
    type: 'time',
    data: 'HH:MM:SS',
    x: 140,
    y: 0,
    width: 56,
    height: 5,
    fontSize: 'Standard5High',
    autoCodeFormat: 'HH:MM:SS',
    autoCodeFieldType: 'time',
  },
  {
    id: 3,
    type: 'date',
    data: 'DD/MM/YY',
    x: 140,
    y: 8,
    width: 56,
    height: 5,
    fontSize: 'Standard5High',
    autoCodeFormat: 'DD/MM/YY',
    autoCodeFieldType: 'date_normal',
  },
];

// ─── Message-level settings ─────────────────────────────────────────────────

const BESTCODE_SETTINGS: MessageSettings = {
  speed: 'Fast',
  rotation: 'Normal',
  printMode: 'Normal',
};

const BESTCODE_AUTO_SETTINGS: MessageSettings = {
  speed: 'Fast',
  rotation: 'Normal',
  printMode: 'Auto',
};

const BESTCODE_ADVANCED: AdvancedSettings = {
  ...defaultAdvancedSettings,
  printMode: 0,
  delay: 100,
  pitch: 5000,
};

const BESTCODE_AUTO_ADVANCED: AdvancedSettings = {
  ...defaultAdvancedSettings,
  printMode: 1,  // Auto
  delay: 100,
  pitch: 5000,
};

// ─── Full message definitions ───────────────────────────────────────────────

export const HARDCODED_BESTCODE: MessageDetails = {
  name: 'BestCode',
  height: 16,
  width: 200,
  fields: BESTCODE_FIELDS,
  templateValue: '16',
  settings: BESTCODE_SETTINGS,
  advancedSettings: BESTCODE_ADVANCED,
};

export const HARDCODED_BESTCODE_AUTO: MessageDetails = {
  name: 'BestCode auto',
  height: 16,
  width: 200,
  fields: BESTCODE_FIELDS.map(f => ({ ...f })), // independent copy
  templateValue: '16',
  settings: BESTCODE_AUTO_SETTINGS,
  advancedSettings: BESTCODE_AUTO_ADVANCED,
};

/**
 * Lookup a hardcoded message by name (case-insensitive match).
 * Returns a deep-copied MessageDetails so callers can't mutate the originals.
 */
export function getHardcodedMessage(name: string): MessageDetails | null {
  const lower = name.toLowerCase();
  if (lower === 'bestcode') {
    return JSON.parse(JSON.stringify(HARDCODED_BESTCODE));
  }
  if (lower === 'bestcode auto') {
    return JSON.parse(JSON.stringify(HARDCODED_BESTCODE_AUTO));
  }
  return null;
}

/**
 * Check whether a message name refers to a hardcoded (non-deletable) message.
 */
export function isHardcodedMessage(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'bestcode' || lower === 'bestcode auto';
}
