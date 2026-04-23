import { useEffect, useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalog, type PersistedSnapshot } from "../catalog";
import { useCatalog } from "../useCatalog";

/**
 * Phase 2 — restart-safety UI.
 *
 * Shows a banner whenever a previously-persisted ledger exists on disk and
 * has NOT yet been resumed/discarded in this browser session. Two modes:
 *
 * 1. No catalog loaded yet → "Restore previous run?" with metadata.
 *    Clicking Restore re-hydrates the catalog from localStorage.
 *
 * 2. A catalog has just been loaded that fingerprint-matches the persisted
 *    one → "Same CSV detected — resume from row N?" Lets the operator pick
 *    up exactly where they left off without manually re-importing.
 */
export function LedgerResumeBanner() {
  const state = useCatalog();
  const [snap, setSnap] = useState<PersistedSnapshot | null>(() => catalog.peekPersisted());
  const [dismissed, setDismissed] = useState(false);

  // Re-poll the persisted snapshot whenever the live state changes — `clear()`
  // and `discardPersisted()` should make the banner go away immediately.
  useEffect(() => {
    setSnap(catalog.peekPersisted());
  }, [state.lastSavedAt, state.hasPersistedSession, state.fingerprint, state.total]);

  if (dismissed || !snap) return null;

  // Hide once we're already running on the same persisted ledger.
  if (state.fingerprint === snap.fingerprint && state.lastSavedAt === snap.savedAt) {
    return null;
  }

  const printed = snap.consumedCount - snap.missCount;
  const remaining = Math.max(0, snap.total - snap.nextIndex);
  const ageMin = Math.max(0, Math.round((Date.now() - snap.savedAt) / 60000));
  const ageStr = ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin}m ago` : `${(ageMin / 60).toFixed(1)}h ago`;

  // Mode 2: a catalog is loaded and matches the persisted fingerprint.
  const isFingerprintMatch =
    state.fingerprint != null &&
    state.fingerprint === snap.fingerprint &&
    state.consumedCount === 0;

  // Mode 1: nothing loaded yet, but we have something on disk.
  const isCold = state.total === 0;

  if (!isFingerprintMatch && !isCold) return null;

  const handleResume = () => {
    if (catalog.resumePersisted()) {
      setDismissed(true);
    }
  };

  const handleDiscard = () => {
    catalog.discardPersisted();
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 rounded-md border border-accent bg-accent/20 p-3 text-sm">
      <History className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
      <div className="flex-1 space-y-1">
        <div className="font-medium text-foreground">
          {isFingerprintMatch
            ? "Same catalog detected — resume previous run?"
            : "Previous catalog session found"}
        </div>
        <div className="text-xs text-muted-foreground">
          {snap.total.toLocaleString()} rows · {printed.toLocaleString()} printed · {snap.missCount.toLocaleString()} missed · {remaining.toLocaleString()} remaining · saved {ageStr}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Resuming preserves the anti-duplication ledger. Discarding lets you start a fresh run.
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="default" onClick={handleResume}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Resume
        </Button>
        <Button size="sm" variant="outline" onClick={handleDiscard}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    </div>
  );
}
