import { useEffect, useState } from "react";
import { productionRun, type ProductionRunState, type ProductionRunSummary } from "./productionRun";
import { useCatalog } from "./useCatalog";

/** Subscribe to active-run + last-completed metadata. */
export function useProductionRun(): ProductionRunState {
  const [state, setState] = useState<ProductionRunState>(() => productionRun.getState());
  useEffect(() => productionRun.subscribe(setState), []);
  return state;
}

/**
 * Live summary of the active run that recomputes whenever the catalog ledger
 * advances (every printed/missed bottle). Returns null when no run is active.
 */
export function useLiveRunSummary(): ProductionRunSummary | null {
  const cat = useCatalog();
  const run = useProductionRun();
  // Re-derive whenever catalog OR run changes.
  // The dependencies don't appear in the body but cat is the trigger.
  void cat;
  if (!run.active) return null;
  return productionRun.liveSummary();
}
