import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Link2, Unlink, Cpu, Wifi } from "lucide-react";
import { twinPairStore, useTwinPair, type TwinPrinterBinding } from "../twinPairStore";

type ProbeState = "idle" | "probing" | "ok" | "fail";

interface SlotState {
  name: string;
  ip: string;
  port: string;
  probe: ProbeState;
  probeMs: number | null;
  probeError: string | null;
}

const DEFAULT_PORT = "23";

function bindingToSlot(b: TwinPrinterBinding | null, fallbackName: string): SlotState {
  return {
    name: b?.name ?? fallbackName,
    ip: b?.ip ?? "",
    port: b?.port?.toString() ?? DEFAULT_PORT,
    probe: "idle",
    probeMs: null,
    probeError: null,
  };
}

/** Quick TCP probe via electronAPI — falls back to "no electron" message in browser. */
async function probePrinter(ip: string, port: number): Promise<{ ok: boolean; ms: number | null; error?: string }> {
  const api = (window as any).electronAPI;
  if (!api?.printer?.checkStatus) {
    // Browser preview: simulate a probe so the dialog still feels responsive
    await new Promise((r) => setTimeout(r, 350));
    return { ok: false, ms: null, error: "Electron required for live TCP probe" };
  }
  try {
    const t0 = performance.now();
    const results = await api.printer.checkStatus([{ id: -1, ipAddress: ip, port }]);
    const ms = Math.round(performance.now() - t0);
    const r = results?.[0];
    if (!r) return { ok: false, ms, error: "No response" };
    if (r.isAvailable) return { ok: true, ms: r.responseTime ?? ms };
    return { ok: false, ms, error: r.error || `status: ${r.status}` };
  } catch (e: any) {
    return { ok: false, ms: null, error: e?.message || "probe failed" };
  }
}

export function TwinPairBindDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const pair = useTwinPair();
  const [slotA, setSlotA] = useState<SlotState>(() => bindingToSlot(pair.a, "Lid printer (DM 16×16)"));
  const [slotB, setSlotB] = useState<SlotState>(() => bindingToSlot(pair.b, "Side printer (text)"));

  // Re-seed when dialog opens, so user always sees current binding
  useEffect(() => {
    if (open) {
      setSlotA(bindingToSlot(pair.a, "Lid printer (DM 16×16)"));
      setSlotB(bindingToSlot(pair.b, "Side printer (text)"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s.trim());
  const validPort = (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) && n > 0 && n < 65536;
  };

  const slotValid = (s: SlotState) => validIp(s.ip) && validPort(s.port);
  const canSave = slotValid(slotA) && slotValid(slotB);

  const handleProbe = async (which: "a" | "b") => {
    const slot = which === "a" ? slotA : slotB;
    const setter = which === "a" ? setSlotA : setSlotB;
    if (!slotValid(slot)) {
      setter({ ...slot, probe: "fail", probeError: "Invalid IP or port", probeMs: null });
      return;
    }
    setter({ ...slot, probe: "probing", probeError: null, probeMs: null });
    const r = await probePrinter(slot.ip.trim(), Number(slot.port));
    setter({
      ...slot,
      probe: r.ok ? "ok" : "fail",
      probeMs: r.ms,
      probeError: r.ok ? null : (r.error ?? "Unreachable"),
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    const a: TwinPrinterBinding = { kind: "ip", name: slotA.name.trim() || "Printer A", ip: slotA.ip.trim(), port: Number(slotA.port) };
    const b: TwinPrinterBinding = { kind: "ip", name: slotB.name.trim() || "Printer B", ip: slotB.ip.trim(), port: Number(slotB.port) };
    twinPairStore.setPair(a, b);
    onOpenChange(false);
  };

  const handleUnbind = () => {
    twinPairStore.clear();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Bind Twin Pair
          </DialogTitle>
          <DialogDescription>
            Pair two printers into a bonded station. Photocell triggers fan out to both simultaneously.
            IP binding only for now — serial / USB will be added in a later phase.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SlotCard
            slotKey="A"
            tagline="Lid · Data Matrix 16×16 · prints down"
            state={slotA}
            onChange={setSlotA}
            onProbe={() => handleProbe("a")}
          />
          <SlotCard
            slotKey="B"
            tagline="Side · text · human-readable serial"
            state={slotB}
            onChange={setSlotB}
            onProbe={() => handleProbe("b")}
          />
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Note:</span> Saving the pair only stores the binding.
          The bonded hot path that actually fans Print Go out to both printers ships in Phase 1b.
          Phase 1a (current) keeps using the simulator and the on-disk catalog ledger.
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {pair.a && pair.b && (
            <Button type="button" variant="outline" onClick={handleUnbind}>
              <Unlink className="mr-2 h-4 w-4" />
              Unbind
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            <Link2 className="mr-2 h-4 w-4" />
            Bind pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotCard({
  slotKey,
  tagline,
  state,
  onChange,
  onProbe,
}: {
  slotKey: "A" | "B";
  tagline: string;
  state: SlotState;
  onChange: (s: SlotState) => void;
  onProbe: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">Printer {slotKey}</Badge>
          <span className="text-[11px] text-muted-foreground">{tagline}</span>
        </div>
        <Cpu className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor={`name-${slotKey}`} className="text-[11px]">Friendly name</Label>
          <Input
            id={`name-${slotKey}`}
            value={state.name}
            onChange={(e) => onChange({ ...state, name: e.target.value })}
            className="h-8 font-mono text-xs"
            placeholder={slotKey === "A" ? "Lid printer · Lane 1" : "Side printer · Lane 1"}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Label htmlFor={`ip-${slotKey}`} className="text-[11px]">IP address</Label>
            <Input
              id={`ip-${slotKey}`}
              value={state.ip}
              onChange={(e) => onChange({ ...state, ip: e.target.value, probe: "idle", probeError: null })}
              className="h-8 font-mono text-xs"
              placeholder="192.168.1.50"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label htmlFor={`port-${slotKey}`} className="text-[11px]">Port</Label>
            <Input
              id={`port-${slotKey}`}
              value={state.port}
              onChange={(e) => onChange({ ...state, port: e.target.value, probe: "idle", probeError: null })}
              className="h-8 font-mono text-xs"
              placeholder="23"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onProbe}
            disabled={state.probe === "probing"}
            className="h-8"
          >
            {state.probe === "probing" ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Testing…</>
            ) : (
              <><Wifi className="mr-2 h-3.5 w-3.5" />Test connection</>
            )}
          </Button>
          <ProbeBadge state={state} />
        </div>
      </div>
    </div>
  );
}

function ProbeBadge({ state }: { state: SlotState }) {
  if (state.probe === "ok") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-mono text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        reachable{state.probeMs != null ? ` · ${state.probeMs} ms` : ""}
      </span>
    );
  }
  if (state.probe === "fail") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-mono text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        {state.probeError || "unreachable"}
      </span>
    );
  }
  return <span className="text-[11px] font-mono text-muted-foreground">not tested</span>;
}
