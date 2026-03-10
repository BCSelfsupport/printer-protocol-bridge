/**
 * Factory-default messages hardcoded in BestCode printers.
 * These cannot be deleted from the printer and are mirrored here
 * so the editor can display them without fetching field data.
 *
 * Model 82/86/88: "BestCode" and "BestCode auto"
 * Quantum (Q/Qx): "QUANTUM" and "QUANTUM AUTO"
 */

import type { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';
import type { MessageSettings } from '@/components/messages/MessageSettingsDialog';
import type { AdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';
import { defaultAdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';

// ─── BestCode field definitions (82/86/88) ──────────────────────────────────

const BESTCODE_FIELDS: MessageField[] = [
  {
    id: 1,
    type: 'text',
    data: 'BC-GEN2',
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
    x: 80,
    y: 0,
    width: 56,
    height: 7,
    fontSize: 'Standard7High',
    autoCodeFormat: 'HH:MM:SS',
    autoCodeFieldType: 'time',
  },
  {
    id: 3,
    type: 'date',
    data: 'MM/DD/YY',
    x: 140,
    y: 9,
    width: 56,
    height: 7,
    fontSize: 'Standard7High',
    autoCodeFormat: 'MM/DD/YY',
    autoCodeFieldType: 'date_normal',
  },
];

// ─── Quantum field definitions (Q/Qx) ──────────────────────────────────────

const QUANTUM_FIELDS: MessageField[] = [
  {
    id: 1,
    type: 'text',
    data: 'QUANTUM',
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
    height: 7,
    fontSize: 'Standard7High',
    autoCodeFormat: 'HH:MM:SS',
    autoCodeFieldType: 'time',
  },
  {
    id: 3,
    type: 'date',
    data: 'MM/DD/YY',
    x: 140,
    y: 9,
    width: 56,
    height: 7,
    fontSize: 'Standard7High',
    autoCodeFormat: 'MM/DD/YY',
    autoCodeFieldType: 'date_normal',
  },
];

// ─── Message-level settings ─────────────────────────────────────────────────

const NORMAL_SETTINGS: MessageSettings = {
  speed: 'Fast',
  rotation: 'Normal',
  printMode: 'Normal',
};

const AUTO_SETTINGS: MessageSettings = {
  speed: 'Fast',
  rotation: 'Normal',
  printMode: 'Auto',
};

const BASE_ADVANCED: AdvancedSettings = {
  ...defaultAdvancedSettings,
  printMode: 0,
  delay: 100,
  pitch: 5000,
};

const AUTO_ADVANCED: AdvancedSettings = {
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
  settings: NORMAL_SETTINGS,
  advancedSettings: BASE_ADVANCED,
};

export const HARDCODED_BESTCODE_AUTO: MessageDetails = {
  name: 'BestCode auto',
  height: 16,
  width: 200,
  fields: BESTCODE_FIELDS.map(f => ({ ...f })),
  templateValue: '16',
  settings: AUTO_SETTINGS,
  advancedSettings: AUTO_ADVANCED,
};

export const HARDCODED_QUANTUM: MessageDetails = {
  name: 'QUANTUM',
  height: 16,
  width: 200,
  fields: QUANTUM_FIELDS,
  templateValue: '16',
  settings: NORMAL_SETTINGS,
  advancedSettings: BASE_ADVANCED,
};

export const HARDCODED_QUANTUM_AUTO: MessageDetails = {
  name: 'QUANTUM AUTO',
  height: 16,
  width: 200,
  fields: QUANTUM_FIELDS.map(f => ({ ...f })),
  templateValue: '16',
  settings: AUTO_SETTINGS,
  advancedSettings: AUTO_ADVANCED,
};

// ─── All hardcoded names (for readonly checks) ──────────────────────────────

const HARDCODED_NAMES = ['bestcode', 'bestcode auto', 'quantum', 'quantum auto'];

/**
 * Lookup a hardcoded message by name (case-insensitive match).
 * Returns a deep-copied MessageDetails so callers can't mutate the originals.
 */
export function getHardcodedMessage(name: string): MessageDetails | null {
  const lower = name.toLowerCase();
  const map: Record<string, MessageDetails> = {
    'bestcode': HARDCODED_BESTCODE,
    'bestcode auto': HARDCODED_BESTCODE_AUTO,
    'quantum': HARDCODED_QUANTUM,
    'quantum auto': HARDCODED_QUANTUM_AUTO,
  };
  const msg = map[lower];
  return msg ? JSON.parse(JSON.stringify(msg)) : null;
}

/**
 * Check whether a message name refers to a hardcoded (non-deletable) message.
 */
export function isHardcodedMessage(name: string): boolean {
  return HARDCODED_NAMES.includes(name.toLowerCase());
}
