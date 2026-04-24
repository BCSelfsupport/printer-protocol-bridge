/**
 * Twin Code — Catalog & Mode Strip (production HUD top bar).
 *
 * Replaces the old Conveyor panel for the operator HUD. Shows ONLY what a
 * production operator needs:
 *   - Load CSV catalog
 *   - Live counters: Total / Remaining / Printed / Miss-prints
 *   - LIVE / SYNTH toggle (with bound-pair guard)
 *   - Dry run ×5 (pre-flight)
 *   - Reset (end-of-lot housekeeping)
 *   - Ledger fingerprint + auto-save heartbeat
 *
 * Everything else (synthetic conveyor visualizer, speed sliders, fault-injection)
 * has been removed from the production view — those are demo/debug tools.
 */

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Trash2,
  Radio,
  Loader2,
  FlaskConical,
  RotateCcw,
  Volume2,
  VolumeX,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { CsvColumnPickerDialog } from "./CsvColumnPickerDialog";
import { LedgerResumeBanner } from "./LedgerResumeBanner";
import { FaultRecoveryBanner } from "./FaultRecoveryBanner";
import { conveyorSim } from "../conveyorSim";
import { catalog } from "../catalog";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { twinDispatcher, type TwinDryRunResult } from "../twinDispatcher";
import { lowCatalogChirp } from "../audioAlarm";
import { usePrinterStorage } from "@/hooks/usePrinterStorage";

const LOW_THRESHOLD_KEY = "twincode.lowCatalogThreshold.v1";
const LOW_AUDIO_KEY = "twincode.lowCatalogAudio.v1";
const DEFAULT_LOW_THRESHOLD = 50;

export function CatalogStripBar() {
  const cat = useCatalog();
  const pair = useTwinPair();
  const { printers } = usePrinterStorage();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [dryBusy, setDryBusy] = useState(false);
  const [lastDryRun, setLastDryRun] = useState<TwinDryRunResult | null>(null);

  // ---- Low-catalog warning settings (persisted) ----
  const [lowThreshold, setLowThreshold] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LOW_THRESHOLD_KEY);
      const n = raw ? parseInt(raw, 10) : DEFAULT_LOW_THRESHOLD;
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_THRESHOLD;
    } catch { return DEFAULT_LOW_THRESHOLD; }
  });
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(LOW_AUDIO_KEY) !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(LOW_THRESHOLD_KEY, String(lowThreshold)); } catch { /* ignore */ }
  }, [lowThreshold]);
  useEffect(() => {
    try { localStorage.setItem(LOW_AUDIO_KEY, audioEnabled ? "1" : "0"); } catch { /* ignore */ }
  }, [audioEnabled]);

  // One-shot guard so the chirp + toast fire on the falling edge only, not
  // every time React rerenders while we're under threshold. Re-arms when
  // remaining climbs back above the threshold (e.g. CSV reloaded / lot reset).
  const lowFiredRef = useRef(false);
  const remaining = Math.max(0, cat.total - cat.nextIndex);
  useEffect(() => {
    if (cat.total === 0) { lowFiredRef.current = false; return; }
    if (remaining > lowThreshold) {
      lowFiredRef.current = false;
      return;
    }
    if (remaining === 0) return; // end-of-lot is handled by auto-stop, not "low"
    if (lowFiredRef.current) return;
    lowFiredRef.current = true;
    if (audioEnabled) lowCatalogChirp();
    toast({
      title: `Low catalog — ${remaining.toLocaleString()} serials remaining`,
      description: `Stage the next CSV before the lot auto-finalizes (threshold: ${lowThreshold}).`,
    });
  }, [remaining, lowThreshold, audioEnabled, cat.total]);


  const pairBound = !!(pair.a && pair.b);

  // Tear down on unmount
  useEffect(() => {
    return () => {
      if (twinDispatcher.isBound()) {
        twinDispatcher.unbind().catch(() => {});
      }
    };
  }, []);

  const enableLive = async () => {
    if (!pairBound) {
      toast({ title: "Bind a twin pair first", variant: "destructive" });
      return;
    }
    setLiveBusy(true);
    const res = await twinDispatcher.bind(pair, printers);
    setLiveBusy(false);
    if (!res.ok) {
      toast({
        title: "Could not enter LIVE mode",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    // In production the real photocell drives prints — the conveyor sim is
    // not used. We still wire the dispatcher in case the operator runs a
    // dry-run ×5 from this strip.
    conveyorSim.setLiveDispatcher((serial) => twinDispatcher.dispatch(serial));
    setLiveMode(true);
    toast({
      title: "LIVE bonded mode active",
      description: `Printer A id=${res.aId}, B id=${res.bId}`,
    });
  };

  const disableLive = async () => {
    setLiveBusy(true);
    conveyorSim.setLiveDispatcher(null);
    await twinDispatcher.unbind();
    setLiveBusy(false);
    setLiveMode(false);
    toast({ title: "LIVE mode disengaged" });
  };

  const runDryRun = async () => {
    setDryBusy(true);
    setLastDryRun(null);
    const seed = catalog.peek() ?? undefined;
    const result = await twinDispatcher.dryRun(5, seed);
    setLastDryRun(result);
    setDryBusy(false);

    if (result.ok) {
      const a = result.aStats;
      const b = result.bStats;
      const skew = result.skewStats;
      toast({
        title: `Dry run passed (${result.passed}/${result.count})`,
        description:
          `A mean ${a?.mean.toFixed(1)}ms · B mean ${b?.mean.toFixed(1)}ms · ` +
          `skew mean ${skew?.mean.toFixed(1)}ms (max ${skew?.max.toFixed(1)})`,
      });
    } else {
      toast({
        title: `Dry run failed (${result.failed}/${result.count})`,
        description: result.reason || "See per-side reasons",
        variant: "destructive",
      });
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setPickerOpen(true);
    e.target.value = "";
  };

  const handleConfirmCsv = (serials: string[]) => {
    const { matchesPersisted } = catalog.load(serials);
    setPickerOpen(false);
    setCsvText(null);
    if (matchesPersisted) {
      toast({
        title: "Same catalog detected",
        description: "Use the resume banner to pick up where the previous run left off.",
      });
    }
  };

  const handleReset = () => {
    if (
      cat.consumedCount > 0 &&
      !confirm(
        "This will reset the local catalog cursor and counters for this lot. The cloud audit ledger is unaffected. Continue?",
      )
    ) {
      return;
    }
    catalog.reset();
  };

  const printed = cat.consumedCount - cat.missCount;
  // `remaining` is computed above (used by the low-catalog watcher); reused here.
  const lowActive = cat.total > 0 && remaining > 0 && remaining <= lowThreshold;

  return (
    <div className="space-y-2">
      <LedgerResumeBanner />
      <FaultRecoveryBanner />

      {/* Low-catalog warning banner (yellow). Visible only while remaining is
          between 1 and the configured threshold; disappears at 0 (auto-stop
          handles that) and above threshold. */}
      {lowActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="text-xs font-medium">
            Low catalog — <span className="font-mono">{remaining.toLocaleString()}</span> serials remaining.
            Stage the next CSV before the lot auto-finalizes.
          </div>
        </div>
      )}

      {/* Action row + LIVE toggle */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" /> Load CSV catalog
        </Button>

        {/* LIVE / SYNTH mode toggle */}
        <div
          className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
            liveMode
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
          title={
            pairBound
              ? "Toggle real bonded dispatch via 1-1 mode"
              : "Bind a twin pair to enable LIVE mode"
          }
        >
          {liveBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Radio className={`h-3.5 w-3.5 ${liveMode ? "text-primary" : ""}`} />
          )}
          <span className="font-mono uppercase tracking-wider">
            {liveMode ? "LIVE" : "SYNTH"}
          </span>
          <Switch
            checked={liveMode}
            disabled={liveBusy || !pairBound}
            onCheckedChange={(v) => (v ? enableLive() : disableLive())}
          />
        </div>

        {/* Pre-flight dry run */}
        <Button
          size="sm"
          variant="outline"
          onClick={runDryRun}
          disabled={!liveMode || dryBusy || liveBusy}
          title="Fire 5 real bonded dispatches and report timings — use BEFORE starting the run"
        >
          {dryBusy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="mr-1 h-4 w-4" />
          )}
          Dry run ×5
        </Button>

        {/* Last dry-run result chip */}
        {lastDryRun && (
          <div
            className={`rounded-md border px-2 py-1 text-[11px] font-mono ${
              lastDryRun.ok
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
            title={lastDryRun.reason || "All shots completed cleanly"}
          >
            {lastDryRun.ok
              ? `✓ ${lastDryRun.passed}/${lastDryRun.count}` +
                (lastDryRun.cycleStats
                  ? ` · cycle ${lastDryRun.cycleStats.mean.toFixed(0)}ms`
                  : "") +
                (lastDryRun.skewStats
                  ? ` · skew ${lastDryRun.skewStats.mean.toFixed(1)}ms`
                  : "")
              : `✗ ${lastDryRun.failed}/${lastDryRun.count} failed`}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={cat.consumedCount === 0 && cat.total === 0}
            title="Reset local lot counters (cloud ledger unaffected)"
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Reset lot
          </Button>
        </div>
      </div>

      {/* Counter strip — large, glanceable */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Counter
          icon={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
          label="Catalog total"
          value={cat.total}
        />
        <Counter
          label="Remaining"
          value={remaining}
          tone={remaining === 0 && cat.total > 0 ? "warn" : "default"}
        />
        <Counter label="Printed" value={printed} tone="ok" />
        <Counter
          label="Miss-prints"
          value={cat.missCount}
          tone={cat.missCount > 0 ? "bad" : "default"}
          extra={
            cat.missCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => {
                  catalog.reset();
                }}
              >
                <Trash2 className="mr-1 h-3 w-3" /> reset
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Persistence status — small, reassures operator the audit trail is alive */}
      {cat.fingerprint && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">
            ledger fp <span className="text-foreground">{cat.fingerprint}</span>
          </span>
          <span>·</span>
          <span>
            {cat.lastSavedAt
              ? `auto-saved ${formatRelativeTime(cat.lastSavedAt)}`
              : "awaiting first save…"}
          </span>
          <span>·</span>
          <span>persists across refresh / restart</span>
        </div>
      )}

      <CsvColumnPickerDialog
        open={pickerOpen}
        rawText={csvText}
        onCancel={() => {
          setPickerOpen(false);
          setCsvText(null);
        }}
        onConfirm={handleConfirmCsv}
      />
    </div>
  );
}

function formatRelativeTime(epochMs: number): string {
  const sec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${(min / 60).toFixed(1)}h ago`;
}

function Counter({
  icon,
  label,
  value,
  tone = "default",
  extra,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "bad";
  extra?: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-yellow-500 dark:text-yellow-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className={`mt-0.5 font-mono text-2xl font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
