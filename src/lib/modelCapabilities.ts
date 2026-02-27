/**
 * Model Capabilities - Hardcoded template and font restrictions per printer model.
 *
 * Derived from the official speed/template charts.
 * Models 81 & 87 are discontinued.
 * Quantum (Q) and Quantum X (Qx) share the same capabilities as Model 88.
 * All 88 sub-models (Micro, Opaque, Food Grade, High Speed, etc.) match Model 88.
 */

/** Template values that match SINGLE_TEMPLATES and MULTILINE_TEMPLATES in EditMessageScreen */
export type TemplateId =
  | '32' | '25' | '19' | '16' | '12' | '9' | '7' | '7s' | '5' | '5s'
  | 'multi-5x5' | 'multi-4x7' | 'multi-4x5'
  | 'multi-3x9' | 'multi-3x7'
  | 'multi-2x12' | 'multi-2x9' | 'multi-2x7' | 'multi-2x5';

/** Font values that match FONT_SIZES in EditMessageScreen */
export type FontId =
  | 'Standard5High' | 'Standard7High' | 'Narrow7High'
  | 'Standard9High' | 'Standard12High' | 'Standard16High'
  | 'Standard19High' | 'Standard25High' | 'Standard32High';

export interface ModelCapabilities {
  templates: TemplateId[];
  fonts: FontId[];
}

// ─── Per-model definitions ──────────────────────────────────────────────────

const MODEL_82: ModelCapabilities = {
  templates: [
    '25', '16', '12', '9', '7', '7s', '5', '5s',
    'multi-2x12', 'multi-2x9', 'multi-2x7',
    'multi-3x9', 'multi-3x7',
  ],
  fonts: [
    'Standard5High', 'Standard7High', 'Narrow7High',
    'Standard9High', 'Standard12High', 'Standard16High',
    'Standard25High',
  ],
};

const MODEL_86: ModelCapabilities = {
  templates: [
    '25', '19', '16', '12', '9', '7', '7s', '5', '5s',
    'multi-2x12', 'multi-2x9', 'multi-2x7',
    'multi-3x9', 'multi-3x7',
  ],
  fonts: [
    'Standard5High', 'Standard7High', 'Narrow7High',
    'Standard9High', 'Standard12High', 'Standard16High',
    'Standard19High', 'Standard25High',
  ],
};

const MODEL_88: ModelCapabilities = {
  templates: [
    '32', '25', '19', '16', '12', '9', '7', '7s', '5', '5s',
    'multi-5x5', 'multi-4x7', 'multi-4x5',
    'multi-3x9', 'multi-3x7',
    'multi-2x12', 'multi-2x9', 'multi-2x7', 'multi-2x5',
  ],
  fonts: [
    'Standard5High', 'Standard7High', 'Narrow7High',
    'Standard9High', 'Standard12High', 'Standard16High',
    'Standard19High', 'Standard25High', 'Standard32High',
  ],
};

// ─── Lookup ─────────────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, ModelCapabilities> = {
  '82': MODEL_82,
  '86': MODEL_86,
  '87': MODEL_86,   // Discontinued but same class as 86
  '88': MODEL_88,
  'Q': MODEL_88,    // Quantum = same as 88
  'Qx': MODEL_88,   // Quantum X = same as 88
};

/**
 * Resolve the capabilities for a given printer model string (from ^VV response).
 * Returns null if the model is unknown — the editor should then show everything (no restrictions).
 */
export function getModelCapabilities(printerModel: string | null | undefined): ModelCapabilities | null {
  if (!printerModel) return null;

  // Normalise: strip whitespace, try direct match first
  const model = printerModel.trim();
  if (MODEL_MAP[model]) return MODEL_MAP[model];

  // Try numeric-only match (e.g. "88S" → "88")
  const numMatch = model.match(/^(\d+)/);
  if (numMatch && MODEL_MAP[numMatch[1]]) return MODEL_MAP[numMatch[1]];

  // Try letter-only match for Quantum models
  if (/^Qx?$/i.test(model)) return MODEL_88;
  if (/^Q/i.test(model)) return MODEL_88;

  return null;
}
