/**
 * Twin Code — Operator HUD.
 *
 * Designed for the shift floor: glanceable from 6 feet, single big BPM number,
 * A/B status lights, last-printed serial in huge mono, batch progress, and an
 * audible alarm on miss-prints.
 *
 * Data sources (single source of truth, no duplication):
 *   - useConveyor()            → live bottle stream + current bpm/line speed
 *   - useCatalog()             → totals, remaining, miss-prints, ledger fp
 *   - useTwinPair()            → bound A/B IPs
 *   - twinDispatcher.isBound() → LIVE engaged?
 *   - profilerBus samples      → last cycle ms / skew (for tiny inline gauges)
 *
 * Side-effects:
 *   - Plays missAlarm() on every new miss when the alarm toggle is on.
 *   - Flashes a destructive overlay for 1.2s after each miss.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Radio,
  ShieldCheck,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useConveyor } from "../useConveyor";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { useProfilerSamples } from "../useProfilerSamples";
import { twinDispatcher } from "../twinDispatcher";
import { missAlarm } from "../audioAlarm";
import { useCloudLedger } from "../useCloudLedger";
import { Cloud, CloudOff } from "lucide-react";

const ALARM_PREF_KEY = "twincode.hud.alarmEnabled";
const UNITS_PREF_KEY = "twincode.hud.units"; // "metric" | "imperial"
type Units = "metric" | "imperial";

function formatLineSpeed(mmPerSec: number, units: Units): string {
  if (units === "imperial") {
    // mm/s → ft/min: ×60 / 304.8
    const ftPerMin = (mmPerSec * 60) / 304.8;
    return `${ftPerMin.toFixed(1)} ft/min`;
  }
  const mPerMin = (mmPerSec / 1000) * 60;
  return `${mPerMin.toFixed(1)} m/min`;
}

export function OperatorHUD() {
  const conv = useConveyor();
  const cat = useCatalog();
  const pair = useTwinPair();
  const samples = useProfilerSamples();

  const [alarmEnabled, setAlarmEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ALARM_PREF_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [units, setUnits] = useState<Units>(() => {
    try {
      return localStorage.getItem(UNITS_PREF_KEY) === "imperial" ? "imperial" : "metric";
    } catch {
      return "metric";
    }
  });
  useEffect(() => {
    try { localStorage.setItem(UNITS_PREF_KEY, units); } catch { /* ignore */ }
  }, [units]);
  const [flashing, setFlashing] = useState(false);
  const lastMissCount = useRef(cat.missCount);

  // Persist alarm preference
  useEffect(() => {
    try {
      localStorage.setItem(ALARM_PREF_KEY, alarmEnabled ? "1" : "0");
    } catch { /* ignore */ }
  }, [alarmEnabled]);

  // Trigger alarm + flash whenever missCount increments
  useEffect(() => {
    if (cat.missCount > lastMissCount.current) {
      if (alarmEnabled) missAlarm();
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 1200);
      lastMissCount.current = cat.missCount;
      return () => clearTimeout(t);
    }
    lastMissCount.current = cat.missCount;
  }, [cat.missCount, alarmEnabled]);

  // Derive last printed serial from the live conveyor (most recent printed bottle).
  const lastPrinted = useMemo(() => {
    for (let i = conv.bottles.length - 1; i >= 0; i--) {
      const b = conv.bottles[i];
      if (b.state === "printed" && b.serial) return b;
    }
    return null;
  }, [conv.bottles]);

  // Derive currently-printing bottle
  const printing = useMemo(
    () => conv.bottles.find((b) => b.state === "printing") ?? null,
    [conv.bottles]
  );

  // Last cycle metrics from profiler bus
  const lastCycle = samples.length > 0 ? samples[samples.length - 1] : null;

  // Yield (printed / consumed) over the run
  const yieldPct = cat.consumedCount > 0
    ? ((cat.consumedCount - cat.missCount) / cat.consumedCount) * 100
    : 100;

  const isLive = twinDispatcher.isBound();
  const pairBound = !!(pair.a && pair.b);
  const hasCatalog = cat.total > 0;

  // Big-status banner determines overall "system green/yellow/red"
  const status = computeOverallStatus({
    pairBound,
    isLive,
    hasCatalog,
    remaining: cat.total - cat.nextIndex,
    missRecent: cat.missCount > lastMissCount.current - 5,
    yieldPct,
  });

  return (
    <div
      className={`relative overflow-hidden rounded-lg border-2 bg-card transition-colors ${
        flashing
          ? "border-destructive animate-pulse"
          : status.tone === "ok"
            ? "border-primary/40"
            : status.tone === "warn"
              ? "border-accent"
              : "border-destructive/60"
      }`}
    >
      {/* Top status bar */}
      <div
        className={`flex items-center justify-between px-5 py-2 text-sm font-semibold ${
          status.tone === "ok"
            ? "bg-primary/10 text-primary"
            : status.tone === "warn"
              ? "bg-accent/30 text-accent-foreground"
              : "bg-destructive/15 text-destructive"
        }`}
      >
        <div className="flex items-center gap-2">
          {status.tone === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : status.tone === "warn" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span className="uppercase tracking-wider">{status.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-normal">
          <div
            className="flex items-center gap-0.5 rounded border border-border/40 bg-background/30 p-0.5"
            role="group"
            aria-label="Unit system"
          >
            <button
              type="button"
              onClick={() => setUnits("metric")}
              className={`rounded px-2 py-0.5 font-mono uppercase tracking-wider transition-colors ${
                units === "metric"
                  ? "bg-foreground/15 text-foreground"
                  : "text-muted-foreground hover:bg-background/30"
              }`}
              aria-pressed={units === "metric"}
            >
              m
            </button>
            <button
              type="button"
              onClick={() => setUnits("imperial")}
              className={`rounded px-2 py-0.5 font-mono uppercase tracking-wider transition-colors ${
                units === "imperial"
                  ? "bg-foreground/15 text-foreground"
                  : "text-muted-foreground hover:bg-background/30"
              }`}
              aria-pressed={units === "imperial"}
            >
              ft
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAlarmEnabled((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-background/30"
            aria-label={alarmEnabled ? "Mute miss-print alarm" : "Unmute miss-print alarm"}
            title={alarmEnabled ? "Click to mute miss-print alarm" : "Click to enable miss-print alarm"}
          >
            {alarmEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>Alarm {alarmEnabled ? "ON" : "OFF"}</span>
          </button>
          <CloudLedgerBadge />
          <span className="font-mono opacity-70">
            ledger {cat.fingerprint ?? "—"}
          </span>
        </div>
      </div>

      {/* Main HUD grid */}
      <div className="grid grid-cols-12 gap-4 p-5">
        {/* === BPM gauge — the dominant element === */}
        <div className="col-span-12 lg:col-span-4">
          <div className="flex h-full flex-col items-center justify-center rounded-md border border-border bg-background/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Throughput
            </div>
            <div className="mt-1 font-mono text-7xl font-bold leading-none text-foreground tabular-nums">
              {Math.round(conv.bpm)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              bottles per minute
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              <Activity className="h-3 w-3" />
              {formatLineSpeed(conv.lineSpeedMmPerSec, units)}
            </div>
          </div>
        </div>

        {/* === Twin printer status lights === */}
        <div className="col-span-12 grid grid-cols-2 gap-3 lg:col-span-4">
          <PrinterLight
            label="A · LID"
            sub={pair.a?.ip ?? "not bound"}
            isOnline={pairBound}
            isLive={isLive}
            pulse={!!printing}
          />
          <PrinterLight
            label="B · SIDE"
            sub={pair.b?.ip ?? "not bound"}
            isOnline={pairBound}
            isLive={isLive}
            pulse={!!printing}
          />
          <ModeLight
            isLive={isLive}
            pairBound={pairBound}
          />
          <YieldLight yieldPct={yieldPct} consumed={cat.consumedCount} />
        </div>

        {/* === Last printed serial — readable from across the room === */}
        <div className="col-span-12 lg:col-span-4">
          <div className="flex h-full flex-col rounded-md border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Last printed
              </div>
              {lastCycle && lastCycle.outcome === "printed" && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  cycle {lastCycle.cycleMs.toFixed(0)}ms · skew {lastCycle.skewMs.toFixed(1)}ms
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-1 items-center justify-center">
              {lastPrinted ? (
                <div className="text-center">
                  <div className="font-mono text-3xl font-bold leading-tight text-primary tabular-nums xl:text-4xl">
                    {lastPrinted.serial}
                  </div>
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    bottle #{lastPrinted.id}
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm italic text-muted-foreground">
                  awaiting first print…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom batch progress strip */}
      <BatchProgress
        total={cat.total}
        nextIndex={cat.nextIndex}
        missCount={cat.missCount}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function PrinterLight({
  label,
  sub,
  isOnline,
  isLive,
  pulse,
}: {
  label: string;
  sub: string;
  isOnline: boolean;
  isLive: boolean;
  pulse: boolean;
}) {
  const tone = !isOnline
    ? "muted"
    : !isLive
      ? "warn"
      : "ok";
  const dotClass =
    tone === "ok"
      ? "bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
      : tone === "warn"
        ? "bg-accent-foreground"
        : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background/40 p-5">
      <span
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dotClass}`}
      >
        {pulse && tone === "ok" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-base font-bold uppercase tracking-wider text-foreground">
          {label}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={sub}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function ModeLight({ isLive, pairBound }: { isLive: boolean; pairBound: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background/40 p-5">
      {isLive ? (
        <Radio className="h-6 w-6 text-primary" />
      ) : (
        <Circle className="h-6 w-6 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-mono text-base font-bold uppercase tracking-wider text-foreground">
          {isLive ? "LIVE" : "SYNTH"}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {isLive ? "real bonded ^MD" : pairBound ? "synthetic timings" : "no pair bound"}
        </div>
      </div>
    </div>
  );
}

function YieldLight({ yieldPct, consumed }: { yieldPct: number; consumed: number }) {
  const tone =
    consumed === 0
      ? "muted"
      : yieldPct >= 99.5
        ? "ok"
        : yieldPct >= 98
          ? "warn"
          : "bad";
  const Icon = tone === "ok" ? ShieldCheck : tone === "bad" ? AlertTriangle : Zap;
  const colorClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-accent-foreground"
        : tone === "bad"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background/40 p-5">
      <Icon className={`h-6 w-6 ${colorClass}`} />
      <div className="min-w-0 flex-1">
        <div className={`font-mono text-base font-bold uppercase tracking-wider ${colorClass}`}>
          {consumed === 0 ? "—" : `${yieldPct.toFixed(2)}%`}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          yield · {consumed.toLocaleString()} dispensed
        </div>
      </div>
    </div>
  );
}

function BatchProgress({
  total,
  nextIndex,
  missCount,
}: {
  total: number;
  nextIndex: number;
  missCount: number;
}) {
  if (total === 0) {
    return (
      <div className="border-t border-border bg-background/40 px-5 py-2.5 text-center text-[11px] text-muted-foreground">
        No catalog loaded — load a CSV to start a batch.
      </div>
    );
  }
  const remaining = Math.max(0, total - nextIndex);
  const pct = total > 0 ? (nextIndex / total) * 100 : 0;
  const printed = nextIndex - missCount;
  return (
    <div className="border-t border-border bg-background/40 px-5 py-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>
          BATCH · <span className="text-foreground">{printed.toLocaleString()}</span> printed ·{" "}
          <span className="text-destructive">{missCount.toLocaleString()}</span> missed ·{" "}
          <span className="text-foreground">{remaining.toLocaleString()}</span> remaining
        </span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Status logic ----------

interface StatusInput {
  pairBound: boolean;
  isLive: boolean;
  hasCatalog: boolean;
  remaining: number;
  missRecent: boolean;
  yieldPct: number;
}

function computeOverallStatus(s: StatusInput): { tone: "ok" | "warn" | "bad"; label: string } {
  if (!s.hasCatalog) return { tone: "warn", label: "No catalog loaded" };
  if (!s.pairBound) return { tone: "warn", label: "Twin pair not bound" };
  if (s.remaining === 0) return { tone: "warn", label: "Catalog exhausted" };
  if (s.missRecent && s.yieldPct < 98) return { tone: "bad", label: "Miss-prints detected" };
  if (!s.isLive) return { tone: "warn", label: "Synthetic mode" };
  return { tone: "ok", label: "Production · all systems nominal" };
}

function CloudLedgerBadge() {
  const cloud = useCloudLedger();
  if (cloud.mode === "off") {
    return (
      <span className="flex items-center gap-1 opacity-60" title="Cloud ledger disabled">
        <CloudOff className="h-3 w-3" /> off
      </span>
    );
  }
  return (
    <span
      className={`flex items-center gap-1 ${cloud.online ? "text-primary/80" : "text-destructive"}`}
      title={cloud.online ? `Cloud sync OK${cloud.lastOkAt ? ` · ${new Date(cloud.lastOkAt).toLocaleTimeString()}` : ""}` : `Cloud offline: ${cloud.lastError ?? "unknown"}`}
    >
      {cloud.online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
      <span className="font-mono">{cloud.online ? "sync" : "offline"}</span>
      {cloud.inFlight > 0 && <span className="opacity-60">·{cloud.inFlight}</span>}
    </span>
  );
}
