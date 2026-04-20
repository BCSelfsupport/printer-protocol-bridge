import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Printer as PrinterIcon, FileText, ScanLine, RotateCcw, Hash, Loader2, Wifi, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScannerView } from '@/components/scan/ScannerView';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useScanBridge } from '@/contexts/ScanBridgeContext';
import type { Printer, PrintMessage } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

/**
 * Scan-to-Print
 *
 * Mobile-first wizard: pick printer → pick message → scan QR → confirm → apply.
 *
 * Wired to the *real* printer via ScanBridgeContext (published from <Index />).
 *
 * Apply pipeline:
 *   1. getStoredMessage(name, printer) — fresh field/template/settings cache
 *   2. Bake `scanned` value into every field flagged `promptBeforePrint`
 *   3. saveMessageContent(...) — atomic ^DM + ^NM + ^SV (handles active-rewrite switch-away)
 *   4. resetCounter(0, value) — only if message has a counter field
 *   5. selectMessage(message) — ^SM
 */

type Step = 'printer' | 'message' | 'scan' | 'confirm' | 'applying' | 'done';

interface ScanMessage {
  /** Raw library entry (used for ^SM at the end) */
  message: PrintMessage;
  /** Cached/parsed details (fields, template, settings) */
  details: MessageDetails;
  /** Field IDs that get the scanned value baked in */
  promptFieldIds: number[];
  /** Field IDs of counters (for ^CN reset) */
  counterFieldIds: number[];
  /** Display labels for the scan-target list */
  promptLabels: { type: string; label: string }[];
}

export default function ScanToPrintPage() {
  const navigate = useNavigate();
  const bridge = useScanBridge();

  const [step, setStep] = useState<Step>('printer');
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [scanMessage, setScanMessage] = useState<ScanMessage | null>(null);
  const [scanned, setScanned] = useState<string>('');
  const [counterMode, setCounterMode] = useState<'reset' | 'start' | 'leave'>('reset');
  const [startNumber, setStartNumber] = useState<string>('1');
  const [applyError, setApplyError] = useState<string | null>(null);

  const restart = () => {
    setStep('printer');
    setPrinter(null);
    setScanMessage(null);
    setScanned('');
    setCounterMode('reset');
    setStartNumber('1');
    setApplyError(null);
  };

  /** Build the list of prompt-aware messages for a given printer using the bridge. */
  const buildScanMessages = (target: Printer): ScanMessage[] => {
    if (!bridge) return [];
    const list = bridge.getMessagesForPrinter(target);
    const out: ScanMessage[] = [];
    for (const entry of list) {
      const details = bridge.getStoredMessage(entry.name, target);
      if (!details) continue;
      const promptFieldIds: number[] = [];
      const counterFieldIds: number[] = [];
      const promptLabels: { type: string; label: string }[] = [];
      for (const f of details.fields) {
        if (f.promptBeforePrint) {
          promptFieldIds.push(f.id);
          const typeLabel = f.type === 'barcode' ? (f.data?.length > 30 ? 'QR/DM' : 'Barcode') : f.type;
          promptLabels.push({
            type: typeLabel,
            label: f.promptLabel || `${typeLabel} field`,
          });
        }
        if (f.type === 'counter') counterFieldIds.push(f.id);
      }
      if (promptFieldIds.length === 0) continue; // Only show messages with at least one promptable field
      out.push({
        message: { id: entry.id, name: entry.name },
        details,
        promptFieldIds,
        counterFieldIds,
        promptLabels,
      });
    }
    return out;
  };

  /** Handle picking a printer — switch live connection to it if needed. */
  const handlePickPrinter = async (p: Printer) => {
    setPrinter(p);
    if (bridge && bridge.connectedPrinterId !== p.id) {
      try {
        await bridge.connectToPrinter(p);
      } catch (e) {
        console.warn('[scan] connectToPrinter failed', e);
      }
    }
    setStep('message');
  };

  const handleApply = async () => {
    if (!bridge || !printer || !scanMessage) return;
    setApplyError(null);
    setStep('applying');

    try {
      // 1. Re-fetch latest details (in case user just edited the message in another window).
      const fresh = bridge.fetchMessageContent
        ? (await bridge.fetchMessageContent(scanMessage.message.name)) ?? scanMessage.details
        : scanMessage.details;

      // 2. Bake the scanned value into every field flagged promptBeforePrint.
      const updatedFields = fresh.fields.map((f) =>
        scanMessage.promptFieldIds.includes(f.id) ? { ...f, data: scanned } : f
      );

      // 3. Atomic ^DM + ^NM + ^SV
      const ok = await bridge.saveMessageContent(
        scanMessage.message.name,
        updatedFields,
        fresh.templateValue,
        false,
        fresh.settings,
      );
      if (!ok) {
        const reason = (bridge.saveMessageContent as unknown as { __lastError?: string }).__lastError || '';
        throw new Error(reason || 'Printer rejected the message save');
      }

      // 4. Counter reset/start (first counter field only)
      if (scanMessage.counterFieldIds.length > 0 && counterMode !== 'leave') {
        const counterValue = counterMode === 'reset' ? 0 : Math.max(0, parseInt(startNumber, 10) || 0);
        await bridge.resetCounter(0, counterValue);
      }

      // 5. ^SM select
      const selected = await bridge.selectMessage(scanMessage.message);
      if (!selected) throw new Error('Printer rejected the message selection (^SM)');

      toast.success('Printer updated', {
        description: `${scanMessage.message.name} · ${printer.name}`,
      });
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[scan] Apply failed:', msg);
      setApplyError(msg);
      toast.error('Apply failed', { description: msg });
      setStep('confirm');
    }
  };

  const stepNumber: Record<Step, number> = { printer: 1, message: 2, scan: 3, confirm: 4, applying: 4, done: 4 };

  // ─── No bridge available (standalone /scan with no app shell) ───
  if (!bridge) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
        <h1 className="text-lg font-bold">Scan to Print is unavailable</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          The scanner needs a connection to the host app. Open <code className="font-mono text-xs">/scan</code> from inside CodeSync (desktop or mobile companion) to use it.
        </p>
        <Button className="mt-6" onClick={() => navigate('/')}>Back to home</Button>
      </div>
    );
  }

  // Filter to printers that are actually usable
  const eligiblePrinters = bridge.printers.filter((p) => p.isAvailable !== false);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 'printer' || step === 'done' ? navigate('/') : goBack())}
            className="h-9 w-9 p-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-emerald-500" />
              Scan to Print
            </h1>
            <p className="text-xs text-muted-foreground">Step {stepNumber[step]} of 4</p>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(stepNumber[step] / 4) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-md w-full mx-auto">
        {step === 'printer' && (
          <PrinterPicker printers={eligiblePrinters} onSelect={handlePickPrinter} />
        )}
        {step === 'message' && printer && (
          <MessagePicker
            printer={printer}
            messages={buildScanMessages(printer)}
            onSelect={(m) => { setScanMessage(m); setStep('scan'); }}
          />
        )}
        {step === 'scan' && (
          <ScanStep
            onResult={(text) => { setScanned(text); setStep('confirm'); }}
            onManual={(text) => { setScanned(text); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && scanMessage && (
          <ConfirmStep
            scanned={scanned}
            scanMessage={scanMessage}
            counterMode={counterMode}
            onCounterModeChange={setCounterMode}
            startNumber={startNumber}
            onStartNumberChange={setStartNumber}
            onApply={handleApply}
            onRescan={() => setStep('scan')}
            error={applyError}
          />
        )}
        {step === 'applying' && <ApplyingStep printerName={printer?.name ?? ''} />}
        {step === 'done' && scanMessage && printer && (
          <DoneStep
            printerName={printer.name}
            messageName={scanMessage.message.name}
            scanned={scanned}
            counterMode={counterMode}
            startNumber={startNumber}
            hasCounter={scanMessage.counterFieldIds.length > 0}
            onAnother={restart}
            onExit={() => navigate('/')}
          />
        )}
      </main>
    </div>
  );

  function goBack() {
    if (step === 'message') setStep('printer');
    else if (step === 'scan') setStep('message');
    else if (step === 'confirm') setStep('scan');
  }
}

/* ───── Step 1: Printer ───── */
function PrinterPicker({ printers, onSelect }: { printers: Printer[]; onSelect: (p: Printer) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Choose a printer</h2>
        <p className="text-sm text-muted-foreground">Pick the printer that will receive the scanned value.</p>
      </div>
      {printers.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No printers available. Add one from the Printers screen first.
        </Card>
      ) : (
        <div className="space-y-2">
          {printers.map((p) => (
            <Card
              key={p.id}
              onClick={() => onSelect(p)}
              className="p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99] transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <PrinterIcon className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wifi className="w-3 h-3" />
                  {p.ipAddress}
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Ready
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Step 2: Message ───── */
function MessagePicker({ printer, messages, onSelect }: { printer: Printer; messages: ScanMessage[]; onSelect: (m: ScanMessage) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Choose a message</h2>
        <p className="text-sm text-muted-foreground">
          Messages on <span className="font-medium text-foreground">{printer.name}</span> with a Prompt-Before-Print field.
        </p>
      </div>
      {messages.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground space-y-2">
          <p>No messages on this printer have a scannable field configured.</p>
          <p className="text-xs">Open the message editor on the PC, pick a field, and toggle <span className="font-medium text-foreground">Prompt before print</span> to make it available here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Card
              key={m.message.name}
              onClick={() => onSelect(m)}
              className="p-4 cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.message.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1">
                    {m.promptLabels.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wide">
                        {t.type} · {t.label}
                      </span>
                    ))}
                    {m.counterFieldIds.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wide">
                        + counter
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Step 3: Scan ───── */
function ScanStep({ onResult, onManual }: { onResult: (text: string) => void; onManual: (text: string) => void }) {
  const [showManual, setShowManual] = useState(false);
  const [manualValue, setManualValue] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Scan the work order</h2>
        <p className="text-sm text-muted-foreground">Point your camera at the QR code on the paper work order.</p>
      </div>

      {!showManual ? (
        <>
          <ScannerView onResult={onResult} />
          <Button variant="outline" className="w-full" onClick={() => setShowManual(true)}>
            Enter code manually instead
          </Button>
        </>
      ) : (
        <Card className="p-4 space-y-3">
          <Label htmlFor="manual">Enter code</Label>
          <Input
            id="manual"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="e.g. 1A4050300009A4D000681364"
            className="font-mono"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowManual(false)}>Back to camera</Button>
            <Button className="flex-1" disabled={!manualValue.trim()} onClick={() => onManual(manualValue.trim())}>
              Use this value
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ───── Step 4: Confirm ───── */
function ConfirmStep({
  scanned, scanMessage, counterMode, onCounterModeChange, startNumber, onStartNumberChange, onApply, onRescan, error,
}: {
  scanned: string; scanMessage: ScanMessage;
  counterMode: 'reset' | 'start' | 'leave'; onCounterModeChange: (m: 'reset' | 'start' | 'leave') => void;
  startNumber: string; onStartNumberChange: (n: string) => void;
  onApply: () => void; onRescan: () => void;
  error: string | null;
}) {
  const hasCounter = scanMessage.counterFieldIds.length > 0;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Confirm and apply</h2>
        <p className="text-sm text-muted-foreground">Nothing is sent to the printer until you tap Apply.</p>
      </div>

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Last attempt failed</div>
            <div className="text-xs mt-0.5 break-all">{error}</div>
          </div>
        </Card>
      )}

      <Card className="p-4 border-emerald-500/40 bg-emerald-500/5">
        <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Scanned value
        </div>
        <div className="mt-2 font-mono text-base font-semibold break-all">{scanned}</div>
        <button onClick={onRescan} className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 underline">
          Scan a different code
        </button>
      </Card>

      <Card className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Will be loaded into</div>
        <div className="mt-1 font-medium">{scanMessage.message.name}</div>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {scanMessage.promptLabels.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={cn(
                'inline-block w-1.5 h-1.5 rounded-full',
                t.type.includes('QR') || t.type.includes('Barcode') ? 'bg-blue-500' : 'bg-emerald-500'
              )} />
              {t.label}
            </li>
          ))}
        </ul>
      </Card>

      {hasCounter && (
        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            Counter
          </div>
          <RadioGroup value={counterMode} onValueChange={(v) => onCounterModeChange(v as 'reset' | 'start' | 'leave')}>
            <Label className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer">
              <RadioGroupItem value="reset" id="reset" />
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              <span>Reset to <span className="font-mono">0</span></span>
            </Label>
            <Label className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer">
              <RadioGroupItem value="start" id="start" />
              <Hash className="w-4 h-4 text-muted-foreground" />
              <span>Start at</span>
              <Input
                type="number"
                min={0}
                value={startNumber}
                onChange={(e) => onStartNumberChange(e.target.value)}
                onClick={(e) => { e.stopPropagation(); onCounterModeChange('start'); }}
                onFocus={(e) => e.currentTarget.select()}
                className="w-24 h-8 ml-auto font-mono"
              />
            </Label>
            <Label className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer">
              <RadioGroupItem value="leave" id="leave" />
              <span className="text-sm">Leave counter as-is</span>
            </Label>
          </RadioGroup>
        </Card>
      )}

      <Button onClick={onApply} className="w-full h-12 text-base" size="lg">
        <CheckCircle2 className="w-5 h-5 mr-2" />
        Apply to printer
      </Button>
    </div>
  );
}

/* ───── Step 5: Applying ───── */
function ApplyingStep({ printerName }: { printerName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
      <div>
        <p className="text-lg font-medium">Updating printer…</p>
        <p className="text-sm text-muted-foreground mt-1">{printerName}</p>
        <p className="text-xs text-muted-foreground mt-3">Sending ^DM → ^NM → ^SV → ^CN → ^SM</p>
      </div>
    </div>
  );
}

/* ───── Step 6: Done ───── */
function DoneStep({
  printerName, messageName, scanned, counterMode, startNumber, hasCounter, onAnother, onExit,
}: {
  printerName: string; messageName: string; scanned: string;
  counterMode: 'reset' | 'start' | 'leave'; startNumber: string;
  hasCounter: boolean;
  onAnother: () => void; onExit: () => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Printer is ready</h2>
          <p className="text-sm text-muted-foreground">The new value is loaded and selected.</p>
        </div>
      </div>

      <Card className="p-4 space-y-2 text-sm">
        <SummaryRow label="Printer" value={printerName} />
        <SummaryRow label="Message" value={messageName} />
        <SummaryRow label="Scanned value" value={scanned} mono />
        {hasCounter && (
          <SummaryRow
            label="Counter"
            value={counterMode === 'reset' ? 'Reset to 0' : counterMode === 'start' ? `Start at ${startNumber}` : 'Left as-is'}
          />
        )}
      </Card>

      <div className="space-y-2">
        <Button onClick={onAnother} className="w-full h-12 text-base" size="lg">
          <ScanLine className="w-5 h-5 mr-2" />
          Scan another
        </Button>
        <Button onClick={onExit} variant="outline" className="w-full">
          Back to home
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex-shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
