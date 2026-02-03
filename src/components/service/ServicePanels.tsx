import React from "react";
import { cn } from "@/lib/utils";

export function ServicePanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg overflow-hidden border bg-card", className)}>
      <header className="bg-industrial-dark text-white px-4 py-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      </header>
      <div className="bg-card">{children}</div>
    </section>
  );
}

export function MetricRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between bg-background text-foreground px-5 py-4 border-t first:border-t-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {unit ? <div className="text-xs text-muted-foreground">{unit}</div> : null}
      </div>
    </div>
  );
}

export function SubsystemPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md px-4 py-2 border text-xs font-semibold tracking-wide",
        "bg-secondary text-secondary-foreground",
        active && "bg-success text-success-foreground border-transparent"
      )}
    >
      {label}: {active ? "ON" : "OFF"}
    </div>
  );
}

export function ConsumableDot({
  label,
  level,
  intent,
}: {
  label: string;
  level: string;
  intent: "ink" | "makeup";
}) {
  const good = level === "FULL" || level === "GOOD";
  const dotClass = cn(
    "w-3 h-3 rounded-full",
    good ? (intent === "ink" ? "bg-primary" : "bg-warning") : "bg-destructive"
  );

  return (
    <div className="flex items-center gap-3">
      <div className={dotClass} />
      <div className="text-xs font-semibold tracking-wide uppercase">
        {label}: <span className="text-muted-foreground">{level}</span>
      </div>
    </div>
  );
}
