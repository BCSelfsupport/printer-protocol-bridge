import { useEffect, useState } from "react";
import { catalog, type CatalogState } from "./catalog";

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => catalog.getState());
  useEffect(() => catalog.subscribe(setState), []);
  return state;
}
