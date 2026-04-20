import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Printer, FileText, ScanLine, RotateCcw, Hash, Loader2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScannerView } from '@/components/scan/ScannerView';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Scan-to-Print POC
 * Mobile-first wizard: pick printer → pick message → scan QR → confirm → apply.
 * 
 * NOTE: This is a proof-of-concept screen. Printer and message lists are mocked
 * here so the workflow can be demoed without a live PC connection. The hooks
 * for the live `/relay/check-status`, `getStoredMessage`, `saveMessageContent`
 * and `^CN` reset are clearly marked with TODO and map 1:1 to existing app
 * functions in `src/pages/Index.tsx` (saveMessageContent, applyPromptValuesToPrinter,
 * resetCounter).
 */

type Step = 'printer' | 'message' | 'scan' | 'confirm' | 'applying' | 'done';

interface MockPrinter {
  id: number;
  name: string;
  ipAddress: string;
  status: 'ready' | 'not_ready' | 'offline';
}
interface MockMessage {
  name: string;
  /** Field labels that will receive the scanned value */
  scanTargets: { type: 'text' | 'qr'; label: string }[];
  /** Field that holds the count */
  hasCounter: boolean;
}

const MOCK_PRINTERS: MockPrinter[] = [
  { id: 1, name: 'Line A — Model 88', ipAddress: '192.168.1.51', status: 'ready' },
  { id: 2, name: 'Line B — Model 82', ipAddress: '192.168.1.52', status: 'ready' },
  { id: 3, name: 'Line C — Model 86', ipAddress: '192.168.1.53', status: 'offline' },
];

const MOCK_MESSAGES: Record<number, MockMessage[]> = {
  1: [
    { name: 'METRC-RETAIL', scanTargets: [{ type: 'text', label: 'Tag (text)' }, { type: 'qr', label: 'Tag (QR)' }], hasCounter: true },
    { name: 'BATCH-LOT', scanTargets: [{ type: 'text', label: 'Lot code' }], hasCounter: true },
  ],
  2: [
    { name: 'METRC-RETAIL', scanTargets: [{ type: 'text', label: 'Tag (text)' }, { type: 'qr', label: 'Tag (QR)' }], hasCounter: true },
  ],
  3: [],
};

export default function ScanToPrintPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('printer');
  const [printer, setPrinter] = useState<MockPrinter | null>(null);
  const [message, setMessage] = useState<MockMessage | null>(null);
  const [scanned, setScanned] = useState<string>('');
  const [counterMode, setCounterMode] = useState<'reset' | 'start'>('reset');
  const [startNumber, setStartNumber] = useState<string>('1');

  const restart = () => {
    setStep('printer');
    setPrinter(null);
    setMessage(null);
    setScanned('');
    setCounterMode('reset');
    setStartNumber('1');
  };

  const handleApply = async () => {
    setStep('applying');
    // TODO POC→PROD: replace this simulated delay with the live calls:
    //   1) saveMessageContent(message.name, baked-fields-with-scanned-value)
    //   2) sendCommand printer.id `^CN ${counterMode === 'reset' ? '0' : startNumber}`
    //   3) sendCommand printer.id `^SM ${message.name}`
    await new Promise(r => setTimeout(r, 1400));
    toast.success('Printer updated', {
      description: `${message?.name} loaded with scanned value on ${printer?.name}`,
    });
    setStep('done');
  };

  const stepNumber: Record<Step, number> = { printer: 1, message: 2, scan: 3, confirm: 4, applying: 4, done: 4 };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Sticky header */}
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
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(stepNumber[step] / 4) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-md w-full mx-auto">
        {step === 'printer' && (
          <PrinterPicker
            printers={MOCK_PRINTERS}
            onSelect={(p) => { setPrinter(p); setStep('message'); }}
          />
        )}
        {step === 'message' && printer && (
          <MessagePicker
            printer={printer}
            messages={MOCK_MESSAGES[printer.id] ?? []}
            onSelect={(m) => { setMessage(m); setStep('scan'); }}
          />
        )}
        {step === 'scan' && (
          <ScanStep
            onResult={(text) => { setScanned(text); setStep('confirm'); }}
            onManual={(text) => { setScanned(text); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && message && (
          <ConfirmStep
            scanned={scanned}
            message={message}
            counterMode={counterMode}
            onCounterModeChange={setCounterMode}
            startNumber={startNumber}
            onStartNumberChange={setStartNumber}
            onApply={handleApply}
            onRescan={() => setStep('scan')}
          />
        )}
        {step === 'applying' && <ApplyingStep printerName={printer?.name ?? ''} />}
        {step === 'done' && message && printer && (
          <DoneStep
            printerName={printer.name}
            messageName={message.name}
            scanned={scanned}
            counterMode={counterMode}
            startNumber={startNumber}
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
function PrinterPicker({ printers, onSelect }: { printers: MockPrinter[]; onSelect: (p: MockPrinter) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Choose a printer</h2>
        <p className="text-sm text-muted-foreground">Pick the printer that will receive the scanned value.</p>
      </div>
      <div className="space-y-2">
        {printers.map((p) => {
          const disabled = p.status !== 'ready';
          return (
            <Card
              key={p.id}
              onClick={() => !disabled && onSelect(p)}
              className={cn(
                'p-4 flex items-center gap-3 transition-all',
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99]'
              )}
            >
              <div className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center',
                disabled ? 'bg-muted' : 'bg-emerald-500/10'
              )}>
                <Printer className={cn('w-5 h-5', disabled ? 'text-muted-foreground' : 'text-emerald-500')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wifi className="w-3 h-3" />
                  {p.ipAddress}
                  <span className={cn(
                    'ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide',
                    p.status === 'ready' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                  )}>
                    {p.status === 'ready' ? 'Ready' : 'Offline'}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ───── Step 2: Message ───── */
function MessagePicker({ printer, messages, onSelect }: { printer: MockPrinter; messages: MockMessage[]; onSelect: (m: MockMessage) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Choose a message</h2>
        <p className="text-sm text-muted-foreground">Messages on <span className="font-medium text-foreground">{printer.name}</span> with a scannable field.</p>
      </div>
      {messages.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No messages on this printer have a scannable field configured. Open the message editor on the PC and flag a field as “Prompt before print” to make it available here.
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Card
              key={m.name}
              onClick={() => onSelect(m)}
              className="p-4 cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1">
                    {m.scanTargets.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wide">
                        {t.type === 'qr' ? 'QR' : 'Text'} · {t.label}
                      </span>
                    ))}
                    {m.hasCounter && (
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
  scanned, message, counterMode, onCounterModeChange, startNumber, onStartNumberChange, onApply, onRescan,
}: {
  scanned: string; message: MockMessage;
  counterMode: 'reset' | 'start'; onCounterModeChange: (m: 'reset' | 'start') => void;
  startNumber: string; onStartNumberChange: (n: string) => void;
  onApply: () => void; onRescan: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Confirm and apply</h2>
        <p className="text-sm text-muted-foreground">Nothing is sent to the printer until you tap Apply.</p>
      </div>

      {/* Scanned value preview */}
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

      {/* Where it goes */}
      <Card className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Will be loaded into</div>
        <div className="mt-1 font-medium">{message.name}</div>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {message.scanTargets.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={cn(
                'inline-block w-1.5 h-1.5 rounded-full',
                t.type === 'qr' ? 'bg-blue-500' : 'bg-emerald-500'
              )} />
              {t.label}
            </li>
          ))}
        </ul>
      </Card>

      {/* Counter */}
      {message.hasCounter && (
        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            Counter
          </div>
          <RadioGroup value={counterMode} onValueChange={(v) => onCounterModeChange(v as 'reset' | 'start')}>
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
      </div>
    </div>
  );
}

/* ───── Step 6: Done ───── */
function DoneStep({
  printerName, messageName, scanned, counterMode, startNumber, onAnother, onExit,
}: {
  printerName: string; messageName: string; scanned: string;
  counterMode: 'reset' | 'start'; startNumber: string;
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
        <SummaryRow label="Value" value={scanned} mono />
        <SummaryRow label="Counter" value={counterMode === 'reset' ? 'Reset to 0' : `Started at ${startNumber}`} />
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>Done</Button>
        <Button className="flex-1" onClick={onAnother}>
          <ScanLine className="w-4 h-4 mr-2" />
          Scan another
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
