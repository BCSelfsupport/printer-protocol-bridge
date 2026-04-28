import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, CheckCircle2, XCircle, Link2, Unlink, Cpu, Wifi, FileText, Hash, Barcode, Type, Sparkles } from "lucide-react";
import { twinPairStore, useTwinPair, type TwinPrinterBinding, type DispatchSubcommand } from "../twinPairStore";
import { seedForSide } from "../messageSeeds";
import { seedTwinPairMessages } from "../twinDispatcher";
import { usePrinterStorage } from "@/hooks/usePrinterStorage";
import { toast } from "@/hooks/use-toast";

type ProbeState = "idle" | "probing" | "ok" | "fail";

interface SlotState {
  name: string;
  ip: string;
  port: string;
  /** Per-side dispatch config */
  messageName: string;
  fieldIndex: string;
  subcommand: DispatchSubcommand;
  /** When true, auto-seed the canonical message on bind if missing. */
  autoCreate: boolean;
  probe: ProbeState;
  probeMs: number | null;
  probeError: string | null;
}

const DEFAULT_PORT = "23";

/** A (lid) defaults to a barcode-data update on field 1, message "LID". */
const A_DEFAULTS = { messageName: "LID",  fieldIndex: 1, subcommand: "BD" as DispatchSubcommand };
/** B (side) defaults to a text update on field 1, message "SIDE". */
const B_DEFAULTS = { messageName: "SIDE", fieldIndex: 1, subcommand: "TD" as DispatchSubcommand };

function bindingToSlot(b: TwinPrinterBinding | null, fallbackName: string, defaults: typeof A_DEFAULTS): SlotState {
  return {
    name: b?.name ?? fallbackName,
    ip: b?.ip ?? "",
    port: b?.port?.toString() ?? DEFAULT_PORT,
    messageName: b?.messageName ?? defaults.messageName,
    fieldIndex: (b?.fieldIndex ?? defaults.fieldIndex).toString(),
    subcommand: b?.subcommand ?? defaults.subcommand,
    // Default ON: removes the manual "build the message on the printer HMI"
    // step before first run. Operator can opt out per side.
    autoCreate: b?.autoCreate ?? true,
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
  const { printers } = usePrinterStorage();
  const [slotA, setSlotA] = useState<SlotState>(() => bindingToSlot(pair.a, "Lid printer (DM 16×16)", A_DEFAULTS));
  const [slotB, setSlotB] = useState<SlotState>(() => bindingToSlot(pair.b, "Side printer (text)", B_DEFAULTS));
  const [saving, setSaving] = useState(false);

  // Re-seed when dialog opens, so user always sees current binding
  useEffect(() => {
    if (open) {
      setSlotA(bindingToSlot(pair.a, "Lid printer (DM 16×16)", A_DEFAULTS));
      setSlotB(bindingToSlot(pair.b, "Side printer (text)", B_DEFAULTS));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s.trim());
  const validPort = (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) && n > 0 && n < 65536;
  };
  const validField = (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) && n >= 1 && n <= 99;
  };
  const validMessageName = (s: string) => s.trim().length > 0 && s.trim().length <= 32;

  const slotValid = (s: SlotState) =>
    validIp(s.ip) && validPort(s.port) && validField(s.fieldIndex) && validMessageName(s.messageName);
  const canSave = slotValid(slotA) && slotValid(slotB);

  const handleProbe = async (which: "a" | "b") => {
    const slot = which === "a" ? slotA : slotB;
    const setter = which === "a" ? setSlotA : setSlotB;
    if (!validIp(slot.ip) || !validPort(slot.port)) {
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

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const a: TwinPrinterBinding = {
      kind: "ip",
      name: slotA.name.trim() || "Printer A",
      ip: slotA.ip.trim(),
      port: Number(slotA.port),
      messageName: slotA.messageName.trim(),
      fieldIndex: Number(slotA.fieldIndex),
      subcommand: slotA.subcommand,
      autoCreate: slotA.autoCreate,
    };
    const b: TwinPrinterBinding = {
      kind: "ip",
      name: slotB.name.trim() || "Printer B",
      ip: slotB.ip.trim(),
      port: Number(slotB.port),
      messageName: slotB.messageName.trim(),
      fieldIndex: Number(slotB.fieldIndex),
      subcommand: slotB.subcommand,
      autoCreate: slotB.autoCreate,
    };
    twinPairStore.setPair(a, b);
    const res = await seedTwinPairMessages({ a, b, boundAt: new Date().toISOString() }, printers, {
      messageNameA: a.messageName,
      messageNameB: b.messageName,
      autoCreateA: a.autoCreate ?? true,
      autoCreateB: b.autoCreate ?? true,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Pair bound, auto-create failed", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: "Twin pair bound",
      description: res.seededA || res.seededB
        ? `Created ${[res.seededA && (a.messageName || 'LID'), res.seededB && (b.messageName || 'SIDE')].filter(Boolean).join(' & ')}`
        : "Required messages already exist",
    });
    onOpenChange(false);
  };

  const handleUnbind = () => {
    twinPairStore.clear();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Bind Twin Pair
          </DialogTitle>
          <DialogDescription>
            Pair two printers into a bonded station. Photocell triggers fan out to both simultaneously.
            Each side has its own message name, field index, and ^MD subcommand so the lid (DataMatrix)
            and side (text) printers can be configured independently.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-tour="bind-ip-fields">
          <div data-tour="bind-message-config">
            <SlotCard
              slotKey="A"
              tagline="Lid · Data Matrix 16×16 · prints down"
              state={slotA}
              onChange={setSlotA}
              onProbe={() => handleProbe("a")}
              validField={validField}
              validMessageName={validMessageName}
            />
          </div>
          <div data-tour="bind-auto-create">
            <SlotCard
              slotKey="B"
              tagline="Side · text · human-readable serial"
              state={slotB}
              onChange={setSlotB}
              onProbe={() => handleProbe("b")}
              validField={validField}
              validMessageName={validMessageName}
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold text-foreground">Wire format on bind:</span>{" "}
            <code className="font-mono">^MB</code> →{" "}
            <code className="font-mono">^LM</code> check →{" "}
            <code className="font-mono">^DM/^NM/^SV</code> if missing →{" "}
            <code className="font-mono">^SM &lt;message&gt;</code> →{" "}
            <code className="font-mono">^MD^&lt;BD|TD&gt;&lt;field&gt;;&lt;serial&gt;</code> per print →{" "}
            <code className="font-mono">^ME</code> on unbind.
          </p>
          <p>
            <span className="font-semibold text-foreground">Auto-create:</span>{" "}
            With auto-create on, the printer doesn't need any prep — bind will lay down a
            canonical message (LID = DM 16×16, SIDE = 7×5 text, both on a 16-dot template)
            if the named one isn't already there. Existing messages are never overwritten.
          </p>
          <p>
            <span className="font-semibold text-foreground">Tip:</span>{" "}
            Use <code className="font-mono">BD</code> for DataMatrix / QR / Code128 fields,{" "}
            <code className="font-mono">TD</code> for plain text. A field-index sanity check (^LF)
            runs on bind and will reject a mismatch with a clear per-side error.
          </p>
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
          <Button type="button" onClick={handleSave} disabled={!canSave || saving} data-tour="bind-confirm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
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
  validField,
  validMessageName,
}: {
  slotKey: "A" | "B";
  tagline: string;
  state: SlotState;
  onChange: (s: SlotState) => void;
  onProbe: () => void;
  validField: (s: string) => boolean;
  validMessageName: (s: string) => boolean;
}) {
  const fieldErr = state.fieldIndex !== "" && !validField(state.fieldIndex);
  const msgErr = state.messageName !== "" && !validMessageName(state.messageName);
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

        {/* ---- Per-side dispatch config ---- */}
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3 w-3" />
            Dispatch config
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor={`msg-${slotKey}`} className="text-[11px] flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Message name
              </Label>
              <Input
                id={`msg-${slotKey}`}
                value={state.messageName}
                onChange={(e) => onChange({ ...state, messageName: e.target.value.toUpperCase() })}
                className={`h-8 font-mono text-xs uppercase ${msgErr ? "border-destructive" : ""}`}
                placeholder={slotKey === "A" ? "LID" : "SIDE"}
                maxLength={32}
              />
            </div>
            <div>
              <Label htmlFor={`field-${slotKey}`} className="text-[11px] flex items-center gap-1">
                <Hash className="h-3 w-3" />
                Field #
              </Label>
              <Input
                id={`field-${slotKey}`}
                value={state.fieldIndex}
                onChange={(e) => onChange({ ...state, fieldIndex: e.target.value.replace(/[^\d]/g, "") })}
                className={`h-8 font-mono text-xs ${fieldErr ? "border-destructive" : ""}`}
                placeholder="1"
                inputMode="numeric"
                maxLength={2}
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">^MD subcommand</Label>
            <ToggleGroup
              type="single"
              value={state.subcommand}
              onValueChange={(v) => v && onChange({ ...state, subcommand: v as DispatchSubcommand })}
              className="mt-1 grid grid-cols-2 gap-1"
            >
              <ToggleGroupItem value="BD" className="h-8 text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <Barcode className="h-3.5 w-3.5" />
                <span className="font-mono">^BD</span>
                <span className="text-[10px] opacity-70">barcode</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="TD" className="h-8 text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <Type className="h-3.5 w-3.5" />
                <span className="font-mono">^TD</span>
                <span className="text-[10px] opacity-70">text</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Live preview of the wire frame */}
          <div className="font-mono text-[10px] text-muted-foreground">
            <span className="text-muted-foreground/70">wire:</span>{" "}
            <span className="text-foreground">
              ^SM {state.messageName || "?"} → ^MD^{state.subcommand}{state.fieldIndex || "?"};&lt;serial&gt;
            </span>
          </div>

          {/* Auto-create on bind */}
          <label
            htmlFor={`auto-${slotKey}`}
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/60 p-2 hover:bg-accent/30"
          >
            <Checkbox
              id={`auto-${slotKey}`}
              checked={state.autoCreate}
              onCheckedChange={(v) => onChange({ ...state, autoCreate: v === true })}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Sparkles className="h-3 w-3 text-primary" />
                Auto-create on bind if missing
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">
                {seedForSide(slotKey).description}
              </div>
            </div>
          </label>
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
