/**
 * React subscription for the fault guard. Single source of truth — the guard
 * itself owns the state; this hook just wires `useSyncExternalStore`.
 */

import { useSyncExternalStore } from "react";
import { faultGuard, type FaultGuardSnapshot } from "./faultGuard";

export function useFaultGuard(): FaultGuardSnapshot {
  return useSyncExternalStore(
    (cb) => faultGuard.subscribe(cb),
    () => faultGuard.getSnapshot(),
    () => faultGuard.getSnapshot(),
  );
}
