import { useState } from 'react';
import { Droplets, Palette, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { calculateFluidUsage, countMessagePreviewDots, DROPLET_ML, TEMPERATURES, type NozzleSize, type Solvent } from '@/lib/fluidUsage';

export interface UsageMessage { key: string; label: string; message: MessageDetails }

export function FluidUsageTool({ messages }: { messages: UsageMessage[] }) {
  const [messageKey, setMessageKey] = useState(messages[0]?.key ?? '');
  const [source, setSource] = useState('bitmap');
  const [verifiedDots, setVerifiedDots] = useState('');
  const [nozzle, setNozzle] = useState<NozzleSize>(75);
  const [solvent, setSolvent] = useState<Solvent>('MEK');
  const [temperature, setTemperature] = useState(25);
  const [schedule, setSchedule] = useState({ printsPerMinute: '100', hoursPerDay: '8', daysPerWeek: '5', weeksPerYear: '50', bottleMl: '946' });
  const message = messages.find(item => item.key === messageKey)?.message;
  const count = message ? countMessagePreviewDots(message) : null;
  const dots = source === 'verified' ? (verifiedDots.trim() ? Number(verifiedDots) : null) : count?.dots ?? null;
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

  return <div className="p-4 space-y-5 max-w-5xl mx-auto w-full">
    <h3 className="font-semibold text-lg">Ink & Makeup Usage</h3>
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="space-y-2"><Label>Message</Label>
        <Select value={messageKey} onValueChange={value => { setMessageKey(value); setVerifiedDots(''); }}>
          <SelectTrigger aria-label="Usage message"><SelectValue placeholder="No saved message content" /></SelectTrigger>
          <SelectContent>{messages.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Dot count source</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger aria-label="Dot count source"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="bitmap">Message bitmap (unverified fonts)</SelectItem><SelectItem value="verified">Verified printer dot count</SelectItem></SelectContent>
        </Select>
      </div>
    </div>
    {source === 'verified' ? <div className="space-y-2 max-w-sm"><Label htmlFor="verified-dots">Verified dots / print</Label><Input id="verified-dots" type="number" min={0} step={1} value={verifiedDots} onChange={e => setVerifiedDots(e.target.value)} /></div> :
      <div className="flex items-start gap-2 text-sm text-warning"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>Font patterns have not been verified against the printer. These counts are estimates, not confirmed printer dots.{count?.dots === null ? ' This message needs a verified dot count for unsupported content.' : ''}{count?.variable ? ' Variable fields use their saved sample values.' : ''}</p></div>}
    {count && source === 'bitmap' && <div className="overflow-x-auto border-y"><table className="w-full text-sm"><thead><tr className="text-muted-foreground text-left"><th className="py-2 font-medium">Field</th><th className="py-2 font-medium">Font</th><th className="py-2 text-right font-medium">Dots</th></tr></thead><tbody>{count.fields.map(field => <tr key={field.id} className="border-t"><td className="py-2 max-w-64 break-words">{field.data || '(empty)'}</td><td className="py-2">{field.font}</td><td className="py-2 text-right tabular-nums">{field.dots ?? 'Unverified'}</td></tr>)}</tbody></table></div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div className="space-y-2"><Label>Nozzle (µm)</Label><Select value={String(nozzle)} onValueChange={value => setNozzle(Number(value) as NozzleSize)}><SelectTrigger aria-label="Nozzle"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(DROPLET_ML).map(size => <SelectItem key={size} value={size}>{size} µm</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Solvent</Label><Select value={solvent} onValueChange={value => setSolvent(value as Solvent)}><SelectTrigger aria-label="Solvent"><SelectValue /></SelectTrigger><SelectContent>{(['MEK', 'Ethanol', 'Acetone'] as const).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Ambient temperature</Label><Select value={String(temperature)} onValueChange={value => setTemperature(Number(value))}><SelectTrigger aria-label="Ambient temperature"><SelectValue /></SelectTrigger><SelectContent>{TEMPERATURES.map(temp => <SelectItem key={temp} value={String(temp)}>{temp} °C / {temp * 9 / 5 + 32} °F</SelectItem>)}</SelectContent></Select></div>
      {inputs.map(([key, label, min, max]) => <div key={key} className="space-y-2"><Label htmlFor={`usage-${key}`}>{label}</Label><Input id={`usage-${key}`} type="number" min={min} max={max} value={schedule[key]} onChange={e => setSchedule(previous => ({ ...previous, [key]: e.target.value }))} /></div>)}
    </div>
    <div className="flex flex-wrap gap-x-8 gap-y-2 border-y py-3 text-sm"><span>Dots / print: <strong>{format(dots, 0)}</strong></span><span>Droplet volume: <strong>{DROPLET_ML[nozzle].toFixed(8)} ml</strong></span><span>Annual prints: <strong>{format(result?.annualPrints, 0)}</strong></span></div>
    <div className="grid sm:grid-cols-2 gap-6">
      {[{ label: 'Ink', icon: Palette, hourly: result?.inkPerHourMl, daily: result?.inkPerDayMl, annual: result?.annualInkMl, bottles: result?.annualInkBottles, hours: result?.inkBottleHours }, { label: 'Makeup', icon: Droplets, hourly: result?.makeupPerHourMl, daily: result?.makeupPerDayMl, annual: result?.annualMakeupMl, bottles: result?.annualMakeupBottles, hours: result?.makeupBottleHours }].map(fluid => <section key={fluid.label} className="space-y-3"><h4 className="flex items-center gap-2 font-semibold"><fluid.icon className="w-5 h-5 text-primary" />{fluid.label}</h4><div className="text-2xl font-semibold tabular-nums">{format(fluid.hourly, 4)} <span className="text-sm font-normal text-muted-foreground">ml / hour</span></div><dl className="text-sm space-y-2">{[['Per day (ml)', fluid.daily], ['Per year (ml)', fluid.annual], ['Bottles / year', fluid.bottles], ['Jet-on hours / bottle', fluid.hours]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{format(value as number | null | undefined)}</dd></div>)}</dl></section>)}
    </div>
    {!result && <p className="text-sm text-warning">Enter a valid dot count and operating schedule to calculate usage.</p>}
    <p className="text-xs text-muted-foreground">Source: Default TCO Sheet, Series 8. Usage is an estimate; excludes cleaning, startup and shutdown losses. Makeup is calculated for all jet-on hours, including idle time. No stock quantities are changed.</p>
  </div>;
}