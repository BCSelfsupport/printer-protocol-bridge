/**
 * Twin Code — Start Production Run dialog.
 *
 * Gates Start until the operator has:
 *   - entered Lot # + operator name,
 *   - loaded a catalog with remaining serials,
 *   - bound a twin pair (warns but does not block synth-only runs).
 *
 * The "LIVE engaged" state is captured into the run metadata at start so
 * the audit trail shows whether the run was real or synthetic.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Play, Loader2, Activity } from "lucide-react";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { twinDispatcher } from "../twinDispatcher";
import { productionRun } from "../productionRun";
import { PreflightDialog } from "./PreflightDialog";
import { toast } from "@/hooks/use-toast";

const OPERATOR_PREF_KEY = "twincode.run.lastOperator";

export function StartRunDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted: () => void;
}) {
  const cat = useCatalog();
  const pair = useTwinPair();
  const isLive = twinDispatcher.isBound();
  const pairBound = !!(pair.a && pair.b);
  const remaining = Math.max(0, cat.total - cat.nextIndex);

  const [lot, setLot] = useState("");
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);

  // Restore last operator name on open
  useEffect(() => {
    if (open) {
      try {
        const saved = localStorage.getItem(OPERATOR_PREF_KEY);
        if (saved) setOperator(saved);
      } catch { /* ignore */ }
      // Suggest a lot number based on date if blank
      if (!lot) {
        const d = new Date();
        const stamp = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, "0")}${d.getDate().toString().padStart(2, "0")}-${d.getHours().toString().padStart(2, "0")}${d.getMinutes().toString().padStart(2, "0")}`;
        setLot(`LOT-${stamp}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const gates = useMemo(() => buildGates({ remaining, pairBound, isLive }), [remaining, pairBound, isLive]);
  const blocking = gates.some((g) => g.required && !g.ok);
  const formValid = lot.trim().length > 0 && operator.trim().length > 0;
  const canStart = formValid && !blocking && !busy;

  const handleStart = async () => {
    if (!canStart) return;
    setBusy(true);
    try {
      productionRun.start({
        lotNumber: lot,
        operator,
        note,
        liveAtStart: isLive,
      });
      try { localStorage.setItem(OPERATOR_PREF_KEY, operator.trim()); } catch { /* ignore */ }
      toast({
        title: `Run started — ${lot.trim()}`,
        description: `${remaining.toLocaleString()} serials available · ${isLive ? "LIVE bonded" : "Synthetic"} mode`,
      });
      onOpenChange(false);
      onStarted();
    } catch (e: any) {
      toast({ title: "Could not start run", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" /> Start production run
          </DialogTitle>
          <DialogDescription>
            Locks the bonded twin printer line to a named batch. Every dispatched bottle is appended to a
            tamper-evident audit log that you can export as CSV or signed JSON when the run ends.
          </DialogDescription>
        </DialogHeader>

        {/* Pre-flight gates */}
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pre-flight checks
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setPreflightOpen(true)}
            >
              <Activity className="h-3 w-3" /> Run dry-run test
            </Button>
          </div>
          {gates.map((g) => (
            <div key={g.label} className="flex items-center gap-2 text-xs">
              {g.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : g.required ? (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={g.ok ? "text-foreground" : g.required ? "text-destructive" : "text-muted-foreground"}>
                {g.label}
              </span>
              {!g.required && !g.ok && (
                <Badge variant="outline" className="ml-auto text-[10px]">optional</Badge>
              )}
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="lot" className="text-xs">Lot number / batch ID *</Label>
            <Input
              id="lot"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="LOT-20260101-0800"
              className="font-mono text-sm"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="operator" className="text-xs">Operator *</Label>
            <Input
              id="operator"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="e.g. J. Doe"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="note" className="text-xs">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Line, shift, comment…"
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleStart} disabled={!canStart}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Start run
          </Button>
        </DialogFooter>

        <PreflightDialog open={preflightOpen} onOpenChange={setPreflightOpen} />
      </DialogContent>
    </Dialog>
  );
}

interface Gate { label: string; ok: boolean; required: boolean; }
function buildGates(s: { remaining: number; pairBound: boolean; isLive: boolean }): Gate[] {
  return [
    {
      label: s.remaining > 0
        ? `Catalog has ${s.remaining.toLocaleString()} serials remaining`
        : "Catalog is empty — load a CSV first",
      ok: s.remaining > 0,
      required: true,
    },
    {
      label: s.pairBound ? "Twin pair bound" : "Twin pair not bound — bind two printers",
      ok: s.pairBound,
      required: false,
    },
    {
      label: s.isLive ? "LIVE bonded mode engaged" : "LIVE mode off — run will use synthetic timings",
      ok: s.isLive,
      required: false,
    },
  ];
}
