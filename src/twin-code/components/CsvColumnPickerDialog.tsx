import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { detectHeader, parseCSV } from "../catalog";

interface Props {
  open: boolean;
  rawText: string | null;
  onCancel: () => void;
  onConfirm: (serials: string[]) => void;
}

/**
 * Multi-column CSV picker. Lets the user pick which column holds the serial
 * and toggle the "first row is a header" flag. Previews the first 8 rows so
 * the user can sanity-check the parse.
 */
export function CsvColumnPickerDialog({ open, rawText, onCancel, onConfirm }: Props) {
  const rows = rawText ? parseCSV(rawText) : [];
  const [hasHeader, setHasHeader] = useState<boolean>(rows.length > 0 ? detectHeader(rows) : false);
  const [colIdx, setColIdx] = useState<number>(0);

  if (!rawText) return null;

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = hasHeader && rows.length > 0 ? rows[0] : (rows[0] ?? []).map((_, i) => `col ${i + 1}`);
  const preview = dataRows.slice(0, 8);
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const serialCount = dataRows.filter((r) => (r[colIdx] ?? "").trim() !== "").length;

  // Customer-confirmed payload shape (Authentix): 13-char uppercase alphanumeric,
  // identical on lid + side. We sample up to 200 rows to flag mismatches early —
  // the most common real-world cause is Excel stripping leading zeros from a
  // numeric-looking column, or the wrong column being picked.
  const SERIAL_FORMAT = /^[A-Z0-9]{13}$/;
  const sample = dataRows.slice(0, 200).map((r) => (r[colIdx] ?? "").trim()).filter(Boolean);
  const mismatched = sample.filter((s) => !SERIAL_FORMAT.test(s));
  const mismatchPct = sample.length === 0 ? 0 : (mismatched.length / sample.length) * 100;
  const mismatchExample = mismatched[0];

  const handleConfirm = () => {
    const serials = dataRows
      .map((r) => (r[colIdx] ?? "").trim())
      .filter((s) => s !== "");
    onConfirm(serials);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import catalog from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="has-header" className="text-sm">First row is a header</Label>
              <p className="text-[11px] text-muted-foreground">
                Auto-detected: <span className="font-mono">{detectHeader(rows) ? "yes" : "no"}</span>
              </p>
            </div>
            <Switch
              id="has-header"
              checked={hasHeader}
              onCheckedChange={setHasHeader}
            />
          </div>

          <div>
            <Label className="text-sm">Which column holds the 13-digit serial?</Label>
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

          {mismatched.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning">
              <div className="font-semibold">
                {mismatched.length} of {sample.length} sampled rows don't match the expected
                {' '}<span className="font-mono">^[A-Z0-9]{'{13}'}$</span> serial format
                {' '}({mismatchPct.toFixed(0)}%).
              </div>
              <div className="mt-1 opacity-90">
                Example: <span className="font-mono">"{mismatchExample}"</span>.
                {' '}Common causes: wrong column selected, Excel stripped leading zeros,
                {' '}or lower-case letters in the source. You can still load — but the
                {' '}printers may reject these rows at dispatch.
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Will load <span className="font-mono font-semibold text-foreground">{serialCount}</span> serial{serialCount === 1 ? "" : "s"} into the catalog. Existing catalog state will be cleared.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={serialCount === 0}>
            Load {serialCount} serial{serialCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
