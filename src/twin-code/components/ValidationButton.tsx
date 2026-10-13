import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/contexts/LicenseContext";
import { useProductionRun } from "../useProductionRun";
import { safetyCheck } from "../validation/liveValidation";
import { ValidationSuiteDialog } from "./ValidationSuiteDialog";

/** Shared operator entry point; never opens validation during production. */
export function ValidationButton({ className }: { className?: string }) {
  const { tier } = useLicense();
  const run = useProductionRun();
  const [open, setOpen] = useState(false);
  const [lineBlocked, setLineBlocked] = useState(() => !safetyCheck().ok);
  useEffect(() => {
    const timer = window.setInterval(() => setLineBlocked(!safetyCheck().ok), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (tier !== "twincode") return null;
  const blocked = !!run.active || lineBlocked;
  return (
    <>
      <Button
        size="sm" variant="outline" className={className ?? "h-7 gap-1 px-2.5 text-xs"}
        disabled={blocked}
        title={blocked ? "Stop production and the live line before validating" : "TwinCode validation with test data and live printers"}
        onClick={() => { if (safetyCheck().ok) setOpen(true); }}
      >
        <FlaskConical className="h-3.5 w-3.5" /> Validate
      </Button>
      <ValidationSuiteDialog open={open} onOpenChange={setOpen} />
    </>
  );
}