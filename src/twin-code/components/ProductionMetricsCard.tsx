/**
 * Twin Code — Production Metrics Card
 *
 * Live readouts derived from REAL ^MD dispatches (not the synthetic
 * conveyor): BPM, line speed (m/min + ft/min), pitch, bottle Ø, gap.
 * Pitch and Ø are operator-editable and persist to localStorage so the
 * mechanical setup carries across reloads.
 */

import { useState } from "react";
import { Activity, Ruler, Circle, Gauge, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLiveMetrics } from "../useLiveMetrics";
import { liveMetrics } from "../liveMetrics";

type Units = "metric" | "imperial";

export function ProductionMetricsCard({ units, compact = false }: { units: Units; compact?: boolean }) {
  const m = useLiveMetrics();
  const [editing, setEditing] = useState<"pitch" | "diameter" | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (which: "pitch" | "diameter") => {
    setDraft(String(which === "pitch" ? m.pitchMm : m.bottleDiameterMm));
    setEditing(which);
  };
  const commitEdit = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n) && editing) {
      if (editing === "pitch") liveMetrics.setConfig({ pitchMm: n });
      else liveMetrics.setConfig({ bottleDiameterMm: n });
    }
    setEditing(null);
  };
  const cancelEdit = () => setEditing(null);

  const lineSpeedDisplay = formatLineSpeed(m.lineSpeedMmPerSec, units);
  const pitchDisplay = formatLength(m.pitchMm, units);
  const diameterDisplay = formatLength(m.bottleDiameterMm, units);
  const gapDisplay = formatLength(m.gapMm, units);

  // ---- Compact: inline strip, no border/padding (host provides chrome) ----
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          <Gauge className="h-4 w-4 text-primary" />
          Production
          {m.hasLiveData ? (
            <span className="flex items-center gap-1 text-primary normal-case tracking-normal">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              live
            </span>
          ) : (
            <span className="normal-case tracking-normal text-muted-foreground/70">idle</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-base">
          <CompactMetric label="BPM" value={m.bpm.toFixed(0)} accent />
          <CompactMetric label="Speed" value={`${lineSpeedDisplay.value} ${lineSpeedDisplay.unit}`} accent />
          <CompactEditable
            label="Pitch"
            value={`${pitchDisplay.value} ${pitchDisplay.unit}`}
            editing={editing === "pitch"}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit("pitch")}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
          <CompactEditable
            label="Ø"
            value={`${diameterDisplay.value} ${diameterDisplay.unit}`}
            editing={editing === "diameter"}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit("diameter")}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
          <CompactMetric label="Gap" value={`${gapDisplay.value} ${gapDisplay.unit}`} />
        </div>
      </div>
    );
  }

  // ---- Full card (used outside the HUD if needed) ----
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" />
          Production metrics
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {m.hasLiveData ? (
            <span className="flex items-center gap-1 text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              live · 60s rolling
            </span>
          ) : (
            <span>awaiting dispatches…</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Live BPM" value={m.bpm.toFixed(0)} sub="bottles/min" accent />
        <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Line speed" value={lineSpeedDisplay.value} sub={lineSpeedDisplay.unit} accent />
        <EditableMetric icon={<Ruler className="h-3.5 w-3.5" />} label="Pitch" value={pitchDisplay.value} sub={pitchDisplay.unit}
          editing={editing === "pitch"} draft={draft} onDraftChange={setDraft}
          onStartEdit={() => startEdit("pitch")} onCommit={commitEdit} onCancel={cancelEdit} />
        <EditableMetric icon={<Circle className="h-3.5 w-3.5" />} label="Bottle Ø" value={diameterDisplay.value} sub={diameterDisplay.unit}
          editing={editing === "diameter"} draft={draft} onDraftChange={setDraft}
          onStartEdit={() => startEdit("diameter")} onCommit={commitEdit} onCancel={cancelEdit} />
        <Metric icon={<Ruler className="h-3.5 w-3.5" />} label="Gap" value={gapDisplay.value} sub={gapDisplay.unit} />
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        BPM is computed from real <span className="font-mono">^MD</span> dispatches over the last 60 seconds.
        Line speed = BPM × pitch. Edit pitch and bottle Ø to match the conveyor's mechanical setup —
        values persist on this PC.
      </div>
    </div>
  );
}

function CompactMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-lg font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function CompactEditable({
  label, value, editing, draft, onDraftChange, onStartEdit, onCommit, onCancel,
}: {
  label: string; value: string; editing: boolean; draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void; onCommit: () => void; onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Input
          type="number"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 w-20 px-2 font-mono text-sm"
        />
        <button type="button" onClick={onCommit} className="rounded p-0.5 hover:bg-muted" aria-label="Save">
          <Check className="h-4 w-4 text-primary" />
        </button>
        <button type="button" onClick={onCancel} className="rounded p-0.5 hover:bg-muted" aria-label="Cancel">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="flex items-baseline gap-1.5 rounded px-1 -mx-1 hover:bg-muted/50 group"
      title={`Edit ${label}`}
    >
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-bold tabular-nums text-foreground">{value}</span>
      <Pencil className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function Metric({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold leading-none tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function EditableMetric({
  icon, label, value, sub, editing, draft, onDraftChange, onStartEdit, onCommit, onCancel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        {!editing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded p-0.5 hover:bg-muted"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 flex items-center gap-1">
          <Input
            type="number"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="h-7 px-2 font-mono text-sm"
          />
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCommit}>
            <Check className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCancel}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
        </>
      )}
    </div>
  );
}

// ---- formatters ----

function formatLineSpeed(mmPerSec: number, units: Units): { value: string; unit: string } {
  if (units === "imperial") {
    const ftPerMin = (mmPerSec * 60) / 304.8;
    return { value: ftPerMin.toFixed(1), unit: "ft/min" };
  }
  const mPerMin = (mmPerSec / 1000) * 60;
  return { value: mPerMin.toFixed(1), unit: "m/min" };
}

function formatLength(mm: number, units: Units): { value: string; unit: string } {
  if (units === "imperial") {
    const inches = mm / 25.4;
    return { value: inches.toFixed(2), unit: "in" };
  }
  return { value: mm.toFixed(0), unit: "mm" };
}
