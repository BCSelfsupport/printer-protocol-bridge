import { useEffect, useRef } from 'react';

/**
 * Listens for a USB "keyboard wedge" barcode scanner at the window level.
 * Scanners type characters very fast (<50ms apart) and finish with Enter;
 * humans type much slower, so slow keystrokes reset the buffer.
 * Keystrokes into editable fields are ignored unless `captureInInputs` is set.
 */
export function useKeyboardWedgeScanner(
  onScan: (value: string) => void,
  opts: { enabled?: boolean; minLength?: number; maxGapMs?: number } = {},
) {
  const { enabled = true, minLength = 3, maxGapMs = 50 } = opts;
  const bufRef = useRef('');
  const lastRef = useRef(0);
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (editable && !t?.dataset?.scanTarget) return;
      const now = performance.now();
      if (now - lastRef.current > maxGapMs) bufRef.current = '';
      lastRef.current = now;
      if (e.key === 'Enter') {
        const v = bufRef.current.trim();
        bufRef.current = '';
        if (v.length >= minLength) {
          e.preventDefault();
          cbRef.current(v);
        }
        return;
      }
      if (e.key.length === 1) bufRef.current += e.key;
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, minLength, maxGapMs]);
}
