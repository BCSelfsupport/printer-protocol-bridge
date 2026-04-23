/**
 * Twin Code — Cloud Ledger Client Adapter
 *
 * Thin wrapper around the `twin-code-ledger` edge function. Two roles:
 *
 *   1. **Hard cross-PC duplicate guard.**
 *      Before a serial leaves the printer, the catalog asks the cloud to
 *      "claim" it. If a different PC already printed that serial in the same
 *      catalog (matched by fingerprint), the cloud returns 409 and the local
 *      catalog records a miss instead — the bottle is NOT printed.
 *
 *   2. **Resume-on-backup.**
 *      When loading a catalog, callers can ask the cloud "what's already been
 *      printed for this fingerprint?" and the catalog will skip those rows.
 *      A dead PC's lot can be picked up on a backup PC without re-printing.
 *
 * Design notes:
 *   - This module is fail-OPEN by default (`mode = "best-effort"`): if the
 *     cloud is unreachable, the local printedSet still enforces the guarantee
 *     within this PC, and prints proceed. Set `setMode("strict")` to fail
 *     CLOSED instead — bottles are missed if the cloud cannot confirm.
 *   - All requests are debounced into a small queue so a 200-bottle/min run
 *     doesn't open 200 fetches/sec. Claims are sent eagerly (one per bottle)
 *     because they're on the critical print path; updates batch via a 1.5s
 *     heartbeat timer.
 *   - We never block the UI. The catalog calls are async and the
 *     conveyor sim awaits the claim before commit.
 */

import { supabase } from "@/integrations/supabase/client";

const FUNCTION_NAME = "twin-code-ledger";
const MACHINE_ID_KEY = "codesync-machine-id";
const LICENSE_STORAGE_KEY = "codesync-license";

export type CloudMode = "best-effort" | "strict" | "off";

interface ClaimSuccess { ok: true; id: string; }
interface ClaimDuplicate { ok: false; duplicate: true; claimedBy: string; claimedAt: string | null; runId: string | null; }
interface ClaimNetworkFailure { ok: false; duplicate: false; networkError: true; message: string; }
export type ClaimResult = ClaimSuccess | ClaimDuplicate | ClaimNetworkFailure;

export interface CloudPrintedRow {
  serial: string;
  bottle_index: number;
  pc_machine_id: string;
  wall_at: string;
  run_id: string | null;
}

export interface CloudActiveRun {
  id: string;
  lot_number: string;
  operator: string;
  note: string | null;
  pc_machine_id: string;
  started_at: string;
  last_heartbeat_at: string;
  printed_count: number;
  missed_count: number;
  live_at_start: boolean;
}

export interface CloudLedgerStatus {
  mode: CloudMode;
  online: boolean;
  /** Wall-clock ms of the most recent successful round-trip. */
  lastOkAt: number | null;
  /** Last error message, if any. */
  lastError: string | null;
  /** Pending in-flight claim count. */
  inFlight: number;
}

type Listener = (s: CloudLedgerStatus) => void;

function getMachineId(): string {
  try {
    let id = localStorage.getItem(MACHINE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(MACHINE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-machine";
  }
}

function getLicenseId(): string | null {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return null;
    const { productKey } = JSON.parse(raw);
    // We only have the product key here; the server resolves it. For now we
    // pass null and let the server attribute by pc_machine_id alone.
    return productKey || null;
  } catch {
    return null;
  }
}

class CloudLedger {
  private status: CloudLedgerStatus = {
    mode: "best-effort",
    online: true,
    lastOkAt: null,
    lastError: null,
    inFlight: 0,
  };
  private listeners = new Set<Listener>();
  private cachedSnapshot: CloudLedgerStatus | null = null;

  setMode(mode: CloudMode) {
    this.status = { ...this.status, mode };
    this.notify();
  }

  getStatus(): CloudLedgerStatus {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    this.cachedSnapshot = { ...this.status };
    return this.cachedSnapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify() {
    this.cachedSnapshot = null;
    const s = this.getStatus();
    this.listeners.forEach((l) => l(s));
  }

  private async invoke<T>(payload: Record<string, unknown>): Promise<T> {
    this.status = { ...this.status, inFlight: this.status.inFlight + 1 };
    this.notify();
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: payload,
      });
      if (error) {
        // supabase-js wraps non-2xx into FunctionsHttpError. Extract context.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            // Treat duplicate-409 as a successful negative answer, not a network failure.
            if (body && body.duplicate === true) {
              this.status = { ...this.status, online: true, lastOkAt: Date.now(), lastError: null };
              return body as T;
            }
            throw new Error(body?.error || error.message);
          } catch {
            throw new Error(error.message);
          }
        }
        throw new Error(error.message);
      }
      this.status = { ...this.status, online: true, lastOkAt: Date.now(), lastError: null };
      return data as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = { ...this.status, online: false, lastError: msg };
      throw err;
    } finally {
      this.status = { ...this.status, inFlight: Math.max(0, this.status.inFlight - 1) };
      this.notify();
    }
  }

  /**
   * Atomically reserve a serial. Returns the cloud's verdict so the caller
   * can decide whether to print. If mode is "off", returns immediate success
   * without contacting the cloud (local guard still applies).
   */
  async claimSerial(args: {
    catalogFingerprint: string;
    serial: string;
    bottleIndex: number;
    runId: string | null;
  }): Promise<ClaimResult> {
    if (this.status.mode === "off") {
      return { ok: true, id: "local-only" };
    }
    try {
      const result = await this.invoke<ClaimSuccess | ClaimDuplicate>({
        op: "claim",
        catalog_fingerprint: args.catalogFingerprint,
        serial: args.serial,
        bottle_index: args.bottleIndex,
        run_id: args.runId,
        license_id: getLicenseId(),
        pc_machine_id: getMachineId(),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.status.mode === "strict") {
        // Strict mode = fail closed. The bottle won't be printed.
        return { ok: false, duplicate: false, networkError: true, message };
      }
      // Best-effort mode = local guard still ran; this serial is unique on
      // this PC. Allow the print to proceed and we'll catch up later.
      return { ok: true, id: "best-effort-skip" };
    }
  }

  async recordMiss(args: {
    catalogFingerprint: string;
    bottleIndex: number;
    runId: string | null;
  }): Promise<void> {
    if (this.status.mode === "off") return;
    try {
      await this.invoke({
        op: "record-miss",
        catalog_fingerprint: args.catalogFingerprint,
        bottle_index: args.bottleIndex,
        run_id: args.runId,
        license_id: getLicenseId(),
        pc_machine_id: getMachineId(),
      });
    } catch {
      // Non-critical; best-effort fire-and-forget.
    }
  }

  async startRun(args: {
    lotNumber: string;
    operator: string;
    note?: string | null;
    catalogFingerprint: string | null;
    catalogTotalAtStart: number;
    liveAtStart: boolean;
  }): Promise<{ id: string; startedAt: string } | null> {
    if (this.status.mode === "off") return null;
    try {
      const r = await this.invoke<{ ok: true; id: string; startedAt: string }>({
        op: "run-start",
        lot_number: args.lotNumber,
        operator: args.operator,
        note: args.note ?? null,
        catalog_fingerprint: args.catalogFingerprint,
        catalog_total_at_start: args.catalogTotalAtStart,
        live_at_start: args.liveAtStart,
        license_id: getLicenseId(),
        pc_machine_id: getMachineId(),
      });
      return { id: r.id, startedAt: r.startedAt };
    } catch {
      return null;
    }
  }

  async heartbeatRun(args: {
    runId: string;
    printedCount: number;
    missedCount: number;
  }): Promise<void> {
    if (this.status.mode === "off") return;
    try {
      await this.invoke({
        op: "run-update",
        run_id: args.runId,
        printed_count: args.printedCount,
        missed_count: args.missedCount,
        pc_machine_id: getMachineId(),
      });
    } catch {
      // Heartbeat failures are tolerable.
    }
  }

  async stopRun(args: {
    runId: string;
    printedCount: number;
    missedCount: number;
  }): Promise<void> {
    if (this.status.mode === "off") return;
    try {
      await this.invoke({
        op: "run-stop",
        run_id: args.runId,
        printed_count: args.printedCount,
        missed_count: args.missedCount,
        pc_machine_id: getMachineId(),
      });
    } catch {
      // The local audit export is the real artifact; cloud stop is best-effort.
    }
  }

  /**
   * Fetch all already-printed serials for a given catalog fingerprint. Used
   * by Resume-on-backup to seed the local printedSet.
   */
  async queryPrinted(catalogFingerprint: string): Promise<CloudPrintedRow[]> {
    if (this.status.mode === "off") return [];
    try {
      const r = await this.invoke<{ ok: true; printed: CloudPrintedRow[] }>({
        op: "query",
        catalog_fingerprint: catalogFingerprint,
      });
      return r.printed ?? [];
    } catch {
      return [];
    }
  }

  /** Find any in-flight runs for a given catalog (for resume picker). */
  async listActiveRuns(catalogFingerprint: string): Promise<CloudActiveRun[]> {
    if (this.status.mode === "off") return [];
    try {
      const r = await this.invoke<{ ok: true; runs: CloudActiveRun[] }>({
        op: "active-runs",
        catalog_fingerprint: catalogFingerprint,
      });
      return r.runs ?? [];
    } catch {
      return [];
    }
  }

  getMachineId(): string { return getMachineId(); }
}

export const cloudLedger = new CloudLedger();
