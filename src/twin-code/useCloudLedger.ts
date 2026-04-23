/**
 * React subscription for the cloud ledger sync status.
 */
import { useSyncExternalStore } from "react";
import { cloudLedger, type CloudLedgerStatus } from "./cloudLedger";

export function useCloudLedger(): CloudLedgerStatus {
  return useSyncExternalStore(
    (cb) => cloudLedger.subscribe(cb),
    () => cloudLedger.getStatus(),
    () => cloudLedger.getStatus(),
  );
}
