import { useState, useEffect } from 'react';
import { Droplets, Palette, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { calculateFluidUsage, countMessagePreviewDots, DROPLET_ML, TEMPERATURES, type NozzleSize, type Solvent } from '@/lib/fluidUsage';
import type { FluidUsageProfile } from '@/lib/fluidUsageProfile';

export interface UsageMessage { key: string; label: string; message?: MessageDetails }

export function FluidUsageTool({ messages, initialMessageKey, onReadMessage, profile, onProfileChange }: {
  messages: UsageMessage[]; initialMessageKey?: string;
  onReadMessage?: (name: string) => Promise<MessageDetails | null>;
  profile?: FluidUsageProfile; onProfileChange?: (value: FluidUsageProfile) => void;
}) {
  const [messageKey, setMessageKey] = useState(initialMessageKey ?? messages[0]?.key ?? '');
  const [nozzle, setNozzle] = useState<NozzleSize>(profile?.nozzle ?? 75);
  const [solvent, setSolvent] = useState<Solvent>(profile?.solvent ?? 'MEK');
  const [temperature, setTemperature] = useState(25);
  const [schedule, setSchedule] = useState({ printsPerMinute: '100', hoursPerDay: '8', daysPerWeek: '5', weeksPerYear: '50', bottleMl: '946' });
  const [readContent, setReadContent] = useState<{ key: string; message: MessageDetails | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const storedMessage = messages.find(item => item.key === messageKey)?.message;
  useEffect(() => {
    if (!messages.some(item => item.key === messageKey)) setMessageKey(messages[0]?.key ?? '');
  }, [messages, messageKey]);
  useEffect(() => {
    let cancelled = false;
    if (!messageKey || !onReadMessage) return;
    setLoading(true);
    onReadMessage(messageKey).then(message => { if (!cancelled) setReadContent({ key: messageKey, message }); })
      .catch(() => { if (!cancelled) setReadContent({ key: messageKey, message: null }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [messageKey, onReadMessage]);
  const message = readContent?.key === messageKey ? readContent.message ?? storedMessage : storedMessage;
  const count = message ? countMessagePreviewDots(message) : null;
  const dots = count?.dots ?? null;
  const result = dots === null || Object.values(schedule).some(value => value.trim() === '') ? null : calculateFluidUsage({
    dots, nozzle, solvent, temperature,
    printsPerMinute: Number(schedule.printsPerMinute), hoursPerDay: Number(schedule.hoursPerDay),
    daysPerWeek: Number(schedule.daysPerWeek), weeksPerYear: Number(schedule.weeksPerYear), bottleMl: Number(schedule.bottleMl),
  });
  const format = (value: number | null | undefined, decimals = 2) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });
  const inputs = [
    ['printsPerMinute', 'Prints / minute', 0, undefined],
    ['hoursPerDay', 'Jet-on hours / day', 0, 24],
    ['daysPerWeek', 'Days / week', 0, 7],
    ['weeksPerYear', 'Weeks / year', 0, 52],
    ['bottleMl', 'Bottle volume (ml)', 1, undefined],
  ] as const;

  return <div className="p-3 space-y-2 max-w-5xl mx-auto w-full [&_label]:text-xs [&_input]:h-8 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs">
    <div className="flex items-center gap-3">
      <h3 className="font-semibold text-sm shrink-0">Ink & Makeup Usage</h3>
      <div className="flex-1 min-w-0">
        <Select value={messageKey} onValueChange={setMessageKey}>
          <SelectTrigger aria-label="Usage message"><SelectValue placeholder="No messages available" /></SelectTrigger>
          <SelectContent>{messages.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    {loading && <p className="text-sm text-muted-foreground">Reading message from printer…</p>}
    {!loading && !message && messageKey && <p className="text-sm text-warning">Message content unavailable. Connect this printer to read its message. The printing message has not been changed.</p>}
    {(count?.dots === null || count?.variable) && <p className="text-sm text-warning">{count?.dots === null ? 'Dot counting is unavailable for unsupported content in this message.' : ''}{count?.variable ? ' Variable fields use their saved sample values.' : ''}</p>}
    {count && <details className="text-xs border-y py-1"><summary className="cursor-pointer text-muted-foreground">{count.fields.length} fields · {format(dots, 0)} estimated dots / print</summary><div className="max-h-28 overflow-auto"><table className="w-full"><tbody>{count.fields.map(field => <tr key={field.id} className="border-t"><td className="py-1 max-w-64 break-words">{field.data || '(empty)'}</td><td className="py-1">{field.font}</td><td className="py-1 text-right tabular-nums">{field.dots ?? 'Unavailable'}</td></tr>)}</tbody></table></div></details>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 [&>div]:min-w-0">
      <div><Label>Nozzle (µm)</Label><Select value={String(nozzle)} onValueChange={value => { const next = Number(value) as NozzleSize; setNozzle(next); onProfileChange?.({ nozzle: next, solvent }); }}><SelectTrigger aria-label="Nozzle"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(DROPLET_ML).map(size => <SelectItem key={size} value={size}>{size} µm</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Solvent</Label><Select value={solvent} onValueChange={value => { const next = value as Solvent; setSolvent(next); onProfileChange?.({ nozzle, solvent: next }); }}><SelectTrigger aria-label="Solvent"><SelectValue /></SelectTrigger><SelectContent>{(['MEK', 'Ethanol', 'Acetone'] as const).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Ambient temperature</Label><Select value={String(temperature)} onValueChange={value => setTemperature(Number(value))}><SelectTrigger aria-label="Ambient temperature"><SelectValue /></SelectTrigger><SelectContent>{TEMPERATURES.map(temp => <SelectItem key={temp} value={String(temp)}>{temp} °C / {temp * 9 / 5 + 32} °F</SelectItem>)}</SelectContent></Select></div>
      {inputs.map(([key, label, min, max]) => <div key={key}><Label htmlFor={`usage-${key}`}>{label}</Label><Input id={`usage-${key}`} type="number" min={min} max={max} value={schedule[key]} onChange={e => setSchedule(previous => ({ ...previous, [key]: e.target.value }))} /></div>)}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Droplet: {DROPLET_ML[nozzle].toFixed(8)} ml</span><span>Annual prints: <strong className="text-foreground">{format(result?.annualPrints, 0)}</strong></span></div>
    <table className="w-full text-sm tabular-nums"><thead><tr className="border-b"><th className="text-left font-medium text-muted-foreground">Estimated usage</th><th className="text-right py-1"><span className="inline-flex items-center gap-1"><Palette className="w-4 h-4 text-primary" />Ink</span></th><th className="text-right py-1"><span className="inline-flex items-center gap-1"><Droplets className="w-4 h-4 text-primary" />Makeup</span></th></tr></thead><tbody>{[
      ['ml / hour', result?.inkPerHourMl, result?.makeupPerHourMl],
      ['ml / day', result?.inkPerDayMl, result?.makeupPerDayMl],
      ['ml / year', result?.annualInkMl, result?.annualMakeupMl],
      ['Bottles / year', result?.annualInkBottles, result?.annualMakeupBottles],
      ['Jet-on hours / bottle', result?.inkBottleHours, result?.makeupBottleHours],
    ].map(([label, ink, makeup], index) => <tr key={String(label)} className="border-b"><td className="py-1 text-muted-foreground">{label}</td><td className="text-right font-medium">{format(ink as number | null | undefined, index === 0 ? 4 : 2)}</td><td className="text-right font-medium">{format(makeup as number | null | undefined, index === 0 ? 4 : 2)}</td></tr>)}</tbody></table>
    {!result && <p className="text-sm text-warning">Choose a message with supported content and enter a valid operating schedule to calculate usage.</p>}
    <aside role="note" aria-label="Installation and commissioning warning" className="border-l-4 border-warning bg-warning/10 px-2 py-2 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
      <div className="text-xs">
        <p><strong>Commissioning:</strong> most of the first ink bottle primes the printer, leaving <strong>146 ml</strong> for printing before ink-low. <strong>Measure usage from the next full bottle.</strong> Estimates use the full bottle volume entered.</p>
      </div>
    </aside>
    <p className="text-xs text-muted-foreground">Source: Default TCO Sheet, Series 8. Usage is an estimate; excludes cleaning, startup and shutdown losses. Makeup is calculated for all jet-on hours, including idle time. No stock quantities are changed.</p>
  </div>;
}