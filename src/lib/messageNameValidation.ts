/**
 * Message name validation rules per BestCode protocol V2.6:
 * - Uppercase A-Z, digits 0-9, underscore, and hyphen (dash) are allowed.
 *   The firmware's ^LM output preserves hyphens in message names (see the
 *   selected-name parser in src/pages/Index.tsx which accepts [A-Z0-9_\-.# ]),
 *   and customers use dashes in part numbers (e.g. "ABC-123").
 * - Max 20 characters.
 * - Cannot use reserved names.
 * - A name cannot start or end with a hyphen (avoids ambiguity with option
 *   flags in the CLI-style ^NM / ^SM / ^DM commands).
 */

const MAX_MESSAGE_NAME_LENGTH = 20;
const VALID_NAME_PATTERN = /^[A-Z0-9_-]+$/;
const RESERVED_NAMES = ['BESTCODE', 'BESTCODE AUTO', 'BESTCODE_AUTO'];

export interface MessageNameValidation {
  valid: boolean;
  error: string | null;
}

export function validateMessageName(name: string): MessageNameValidation {
  const trimmed = name.trim().toUpperCase();

  if (!trimmed) {
    return { valid: false, error: 'Message name is required' };
  }

  if (trimmed.length > MAX_MESSAGE_NAME_LENGTH) {
    return { valid: false, error: `Max ${MAX_MESSAGE_NAME_LENGTH} characters allowed` };
  }

  if (!VALID_NAME_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Only letters A-Z, digits 0-9, underscore and hyphen (-) allowed' };
  }

  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { valid: false, error: 'Name cannot start or end with a hyphen' };
  }

  if (RESERVED_NAMES.includes(trimmed)) {
    return { valid: false, error: 'This is a reserved message name' };
  }

  return { valid: true, error: null };
}

/** Sanitize input to only allow valid characters, uppercase, and enforce max length */
export function sanitizeMessageName(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, MAX_MESSAGE_NAME_LENGTH);
}

