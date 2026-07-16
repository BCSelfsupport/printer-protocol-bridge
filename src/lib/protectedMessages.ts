/**
 * Protected messages registry.
 *
 * Some messages on a printer are safety nets that must NEVER be overwritten
 * by CodeSync — for example a "60DAYBACKUPCODE" that uses the printer's own
 * User Prompt firmware feature (which CodeSync has no protocol coverage for).
 * Overwriting such a message via ^NM would strip the printer-side User Prompt
 * field and the operator would lose their offline backup.
 *
 * Protection is keyed by message name (case-insensitive, trimmed) and applies
 * globally across every printer — the same backup name on every printer in the
 * fleet is protected in one go.
 *
 * Enforced by:
 *   - replaceMessageWithoutDelete()  in src/pages/Index.tsx
 *   - copyMessageToPrinters()        (pre-filter, better UX)
 *   - syncMessageToSlaves()          (pre-filter, better UX)
 *   - MessagesScreen Edit / Delete buttons
 */

import { useEffect, useReducer } from 'react';

const KEY = 'bestcode-protected-messages';

const norm = (name: string): string => (name ?? '').trim().toUpperCase();

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

let cache: Set<string> = load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(cache)));
  } catch (e) {
    console.error('[ProtectedMessages] Failed to persist', e);
  }
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function isMessageProtected(name: string): boolean {
  return cache.has(norm(name));
}

export function getProtectedMessages(): string[] {
  return Array.from(cache);
}

export function setMessageProtected(name: string, protectedFlag: boolean): void {
  const n = norm(name);
  if (!n) return;
  const had = cache.has(n);
  if (protectedFlag && !had) {
    cache.add(n);
    persist();
  } else if (!protectedFlag && had) {
    cache.delete(n);
    persist();
  }
}

export function subscribeProtectedMessages(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React hook — re-renders when protection state changes. */
export function useProtectedMessages() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeProtectedMessages(force), []);
  return {
    isProtected: (name: string) => isMessageProtected(name),
    setProtected: setMessageProtected,
    toggle: (name: string) => setMessageProtected(name, !isMessageProtected(name)),
    all: getProtectedMessages(),
  };
}
