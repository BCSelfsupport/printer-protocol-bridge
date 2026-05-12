import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { detectHeader, parseCSV } from "../catalog";
import { SERIAL_FORMAT } from "../catalogQueue";

interface Props {
  open: boolean;
  rawText: string | null;
  /**
   * "active" — replace the current catalog (initial load / new lot).
   * "queue"  — add this CSV to the on-deck queue (continuous-run shifts).
   */
  target?: "active" | "queue";
  filename?: string;
  onCancel: () => void;
  onConfirm: (serials: string[], target: "active" | "queue", filename: string) => void;
}

/**
 * CSV picker — column + header detection + STRICT serial-format validation.
 *
 * The expected shape is `LL Y JJJ NNNNNN U` (line, year, julian, serial, unit
 * marker — Authentix-confirmed 2026-05). Rows that don't match are blocking
 * errors: the operator must fix the source file before TwinCode will accept
 * it. This is intentional — a malformed batch silently mixed into a live
 * production line is a bigger problem than a rejected upload.
 */
export function CsvColumnPickerDialog({ open, rawText, target = "active", filename = "catalog.csv", onCancel, onConfirm }: Props) {
  const rows = rawText ? parseCSV(rawText) : [];
  const [hasHeader, setHasHeader] = useState<boolean>(rows.length > 0 ? detectHeader(rows) : false);
  const [colIdx, setColIdx] = useState<number>(0);

  if (!rawText) return null;

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = hasHeader && rows.length > 0 ? rows[0] : (rows[0] ?? []).map((_, i) => `col ${i + 1}`);
  const preview = dataRows.slice(0, 8);
  const colCount = Math.max(0, ...rows.map((r) => r.length));

  // Validate EVERY non-empty row in the selected column against the customer-
  // confirmed format. We don't sample-and-warn anymore — it's pass-or-fail.
  const allCells = dataRows.map((r) => (r[colIdx] ?? "").trim()).filter((s) => s !== "");
  const badIdx: number[] = [];
  for (let i = 0; i < allCells.length; i++) {
    if (!SERIAL_FORMAT.test(allCells[i])) badIdx.push(i);
  }
  const badCount = badIdx.length;
  const badExamples = badIdx.slice(0, 3).map((i) => allCells[i]);
  const valid = badCount === 0 && allCells.length > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(allCells, target, filename);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {target === "queue" ? "Stage next catalog (on-deck)" : "Import catalog from CSV"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {target === "queue" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
              This file will sit on deck and auto-promote when the active catalog
              drops to the low-water mark, so the line keeps printing across
              shift changes / midnight without an operator intervention.
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="has-header" className="text-sm">First row is a header</Label>
              <p className="text-[11px] text-muted-foreground">
                Auto-detected: <span className="font-mono">{detectHeader(rows) ? "yes" : "no"}</span>
              </p>
            </div>
            <Switch id="has-header" checked={hasHeader} onCheckedChange={setHasHeader} />
          </div>

          <div>
            <Label className="text-sm">Which column holds the serial?</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: colCount }, (_, i) => (
                <Button
                  key={i}
                  type="button"
                  variant={colIdx === i ? "default" : "outline"}
                  size="sm"
                  className="justify-start font-mono text-xs"
                  onClick={() => setColIdx(i)}
                >
                  <span className="truncate">{headers[i] ?? `col ${i + 1}`}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
              Preview (first {preview.length} rows · selected column highlighted)
            </div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/20">
                    {Array.from({ length: colCount }, (_, i) => (
                      <th
                        key={i}
                        className={`px-2 py-1 text-left font-mono ${i === colIdx ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                      >
                        {headers[i] ?? `col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri} className="border-t border-border">
                      {Array.from({ length: colCount }, (_, ci) => (
                        <td
                          key={ci}
                          className={`px-2 py-1 font-mono ${ci === colIdx ? "bg-primary/5 text-foreground" : "text-muted-foreground"}`}
                        >
                          {r[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Format gate. Hard block — operators have to fix the CSV upstream. */}
          {badCount > 0 ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[11px] text-destructive">
              <div className="font-semibold">
                {badCount.toLocaleString()} of {allCells.length.toLocaleString()} rows don't match the
                expected serial shape <span className="font-mono">LL Y JJJ NNNNNN U</span>
                {' '}(<span className="font-mono">^\d{'{2}'}[A-Z]\d{'{3}'}\d{'{6}'}U$</span>, 13 chars).
              </div>
              <div className="mt-1 opacity-90">
                Examples: {badExamples.map((s, i) => (
                  <span key={i} className="font-mono">"{s}"{i < badExamples.length - 1 ? ', ' : ''}</span>
                ))}
              </div>
              <div className="mt-2 opacity-80">
                Common causes: wrong column selected, Excel stripped leading zeros,
                lower-case letters in the source, or this file is for a different line.
                Fix the source and re-upload.
              </div>
            </div>
          ) : valid ? (
            <p className="text-xs text-muted-foreground">
              {target === "queue" ? "Will queue " : "Will load "}
              <span className="font-mono font-semibold text-foreground">{allCells.length.toLocaleString()}</span> serials
              {target === "active" && ". Existing catalog state will be cleared."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Pick the column containing your serials.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!valid}>
            {target === "queue" ? "Stage on deck" : `Load ${allCells.length.toLocaleString()} serials`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
