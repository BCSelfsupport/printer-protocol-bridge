/**
 * TwinCodePage — standalone /twin-code route.
 * Thin shell around TwinCodeView (which contains all the workspace logic and
 * is also embedded inside PrintersScreen's right pane when a Bound Pair is
 * selected on a TwinCode-licensed system).
 */
import { useEffect } from "react";
import { TwinCodeView } from "@/twin-code/components/TwinCodeView";

const PAGE_TITLE = "Twin Code — Profiler Harness (Phase 1a)";

export default function TwinCodePage() {
  // Set page title (SEO)
  useEffect(() => {
    const prev = document.title;
    document.title = PAGE_TITLE;
    return () => { document.title = prev; };
  }, []);

  return <TwinCodeView />;
}
