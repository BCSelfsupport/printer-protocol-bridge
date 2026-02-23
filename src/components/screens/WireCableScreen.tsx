import { useState, useEffect, useCallback, useRef } from 'react';
import { Cable, Gauge, RotateCcw, Ruler, ArrowLeft, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { CableAnimation } from '@/components/wirecable/CableAnimation';
import { EncoderCalibration, EncoderConfig } from '@/components/wirecable/EncoderCalibration';
import { FlipFlopConfig, FlipFlopSettings } from '@/components/wirecable/FlipFlopConfig';
import { PrintSettings } from '@/types/printer';
import { MessageDetails } from '@/components/screens/EditMessageScreen';

interface WireCableScreenProps {
  onHome: () => void;
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSendCommand: (command: string) => Promise<any>;
  isConnected: boolean;
  printCount?: number;
  productCount?: number;
  currentMessage?: MessageDetails | null;
}

const DEFAULT_ENCODER: EncoderConfig = {
  wheelDiameterMm: 63.66, // ~200mm circumference
  pulsesPerRevolution: 200,
  unit: 'mm',
};

const DEFAULT_FLIPFLOP: FlipFlopSettings = {
  enabled: false,
  orientationA: 'Normal',
  orientationB: 'Flip',
};

export function WireCableScreen({
  onHome,
  settings,
  onUpdate,
  onSendCommand,
  isConnected,
  printCount = 0,
  productCount = 0,
  currentMessage,
}: WireCableScreenProps) {
  const [encoder, setEncoder] = useState<EncoderConfig>(() => {
    const saved = localStorage.getItem('wirecable-encoder');
    return saved ? JSON.parse(saved) : DEFAULT_ENCODER;
  });

  const [flipFlop, setFlipFlop] = useState<FlipFlopSettings>(() => {
    const saved = localStorage.getItem('wirecable-flipflop');
    return saved ? JSON.parse(saved) : DEFAULT_FLIPFLOP;
  });

  const [desiredPitch, setDesiredPitch] = useState<number>(() => {
    const saved = localStorage.getItem('wirecable-pitch');
    return saved ? parseFloat(saved) : 100;
  });

  const lastFlipFlopRef = useRef<'A' | 'B'>('A');

  // Persist settings
  useEffect(() => {
    localStorage.setItem('wirecable-encoder', JSON.stringify(encoder));
  }, [encoder]);

  useEffect(() => {
    localStorage.setItem('wirecable-flipflop', JSON.stringify(flipFlop));
  }, [flipFlop]);

  useEffect(() => {
    localStorage.setItem('wirecable-pitch', desiredPitch.toString());
  }, [desiredPitch]);

  // Calculate mm per pulse from encoder config
  const mmPerPulse = (Math.PI * encoder.wheelDiameterMm) / encoder.pulsesPerRevolution;

  // Convert desired pitch to encoder pulses (^PA value)
  const pitchMm = encoder.unit === 'inches' ? desiredPitch * 25.4 : desiredPitch;
  const pitchPulses = Math.round(pitchMm / mmPerPulse);

  // Display values in chosen unit
  const isImperial = encoder.unit === 'inches';
  const totalLengthMm = printCount * pitchMm;
  const totalLengthDisplay = isImperial
    ? (totalLengthMm / 25.4 / 12).toFixed(1) // feet
    : (totalLengthMm / 1000).toFixed(1); // meters
  const lengthUnit = isImperial ? 'ft' : 'm';
  const lengthLabel = isImperial ? 'Feet Printed' : 'Meters Printed';

  // Apply pitch to printer
  const handleApplyPitch = useCallback(async () => {
    const clamped = Math.max(0, Math.min(4000000000, pitchPulses));
    onUpdate({ pitch: clamped });
    await onSendCommand(`^PA ${clamped}`);
  }, [pitchPulses, onUpdate, onSendCommand]);

  // Flip-flop: alternate orientation on each print
  // This would be triggered by the app watching print count changes
  const ORIENTATION_MAP: Record<string, number> = {
    'Normal': 0, 'Flip': 1, 'Mirror': 2, 'Mirror Flip': 3,
    'Tower': 4, 'Tower Flip': 5, 'Tower Mirror': 6, 'Tower Mirror Flip': 7,
  };

  // Watch print count for flip-flop
  useEffect(() => {
    if (!flipFlop.enabled || !isConnected) return;
    const next = lastFlipFlopRef.current === 'A' ? 'B' : 'A';
    const orientation = next === 'A' ? flipFlop.orientationA : flipFlop.orientationB;
    const orientationValue = ORIENTATION_MAP[orientation] ?? 0;
    lastFlipFlopRef.current = next;
    onSendCommand(`^CM o${orientationValue}`);
  }, [printCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SubPageHeader title="Wire & Cable" onHome={onHome} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Connection status + Unit toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'default' : 'secondary'} className={isConnected ? 'bg-success text-success-foreground' : ''}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </Badge>
            {!isConnected && (
              <span className="text-xs text-muted-foreground hidden sm:inline">Connect to a printer to enable live controls</span>
            )}
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => {
                if (encoder.unit === 'inches') {
                  // Convert inches to mm
                  setDesiredPitch(prev => parseFloat((prev * 25.4).toFixed(2)));
                }
                setEncoder(prev => ({ ...prev, unit: 'mm' }));
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                encoder.unit === 'mm'
                  ? 'industrial-button text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Metric (mm)
            </button>
            <button
              onClick={() => {
                if (encoder.unit === 'mm') {
                  // Convert mm to inches
                  setDesiredPitch(prev => parseFloat((prev / 25.4).toFixed(4)));
                }
                setEncoder(prev => ({ ...prev, unit: 'inches' }));
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                encoder.unit === 'inches'
                  ? 'industrial-button text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Imperial (in)
            </button>
          </div>
        </div>

        {/* Animated Cable Visualization */}
        <CableAnimation
          pitchMm={pitchMm}
          flipFlopEnabled={flipFlop.enabled}
          orientationA={flipFlop.orientationA}
          orientationB={flipFlop.orientationB}
          isRunning={isConnected}
          messageFields={currentMessage?.fields}
          messageHeight={currentMessage?.height}
          unit={encoder.unit as 'mm' | 'inches'}
          desiredPitch={desiredPitch}
        />

        {/* Metric Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={<Ruler className="w-5 h-5 text-primary" />}
            label="Pitch"
            value={`${desiredPitch} ${encoder.unit}`}
            subValue={isImperial
              ? `${(desiredPitch / 12).toFixed(3)} ft · ${pitchMm.toFixed(1)} mm`
              : `${(pitchMm / 1000).toFixed(4)} m · ${(pitchMm / 25.4).toFixed(3)} in`
            }
          />
          <MetricCard
            icon={<Gauge className="w-5 h-5 text-primary" />}
            label={lengthLabel}
            value={totalLengthDisplay}
            subValue={`${lengthUnit} (est.)`}
          />
          <MetricCard
            icon={<Cable className="w-5 h-5 text-primary" />}
            label="Print Count"
            value={printCount.toLocaleString()}
            subValue="prints"
          />
          <MetricCard
            icon={<RotateCcw className="w-5 h-5 text-primary" />}
            label="Flip-Flop"
            value={flipFlop.enabled ? 'Active' : 'Off'}
            subValue={flipFlop.enabled ? `${flipFlop.orientationA} ↔ ${flipFlop.orientationB}` : '—'}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pitch Control */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Pitch / Repeat Distance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isImperial ? (
                <div className="space-y-2">
                  <Label className="text-sm">Desired Pitch</Label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Feet</span>
                      <Input
                        type="number"
                        value={parseFloat((desiredPitch / 12).toFixed(4))}
                        onChange={(e) => {
                          const ft = parseFloat(e.target.value) || 0;
                          setDesiredPitch(ft * 12);
                        }}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Inches</span>
                      <Input
                        type="number"
                        value={parseFloat(desiredPitch.toFixed(4))}
                        onChange={(e) => {
                          const inches = parseFloat(e.target.value) || 0;
                          setDesiredPitch(inches);
                        }}
                        min={0}
                        step={0.1}
                      />
                    </div>
                    <button
                      onClick={handleApplyPitch}
                      disabled={!isConnected}
                      className="industrial-button text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">Desired Pitch</Label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Meters</span>
                      <Input
                        type="number"
                        value={parseFloat((desiredPitch / 1000).toFixed(4))}
                        onChange={(e) => {
                          const meters = parseFloat(e.target.value) || 0;
                          setDesiredPitch(meters * 1000);
                        }}
                        min={0}
                        step={0.001}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">mm</span>
                      <Input
                        type="number"
                        value={parseFloat(desiredPitch.toFixed(1))}
                        onChange={(e) => {
                          const mm = parseFloat(e.target.value) || 0;
                          setDesiredPitch(mm);
                        }}
                        min={0}
                        step={1}
                      />
                    </div>
                    <button
                      onClick={handleApplyPitch}
                      disabled={!isConnected}
                      className="industrial-button text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{isImperial ? 'in/pulse:' : 'mm/pulse:'}</span>
                  <span className="ml-2 font-mono font-bold">
                    {isImperial ? (mmPerPulse / 25.4).toFixed(6) : mmPerPulse.toFixed(4)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{isImperial ? 'Pitch (in):' : 'Pitch (mm):'}</span>
                  <span className="ml-2 font-mono font-bold">
                    {isImperial ? (pitchMm / 25.4).toFixed(3) : pitchMm.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">^PA value:</span>
                  <span className="ml-2 font-mono font-bold">{pitchPulses.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current ^PA:</span>
                  <span className="ml-2 font-mono font-bold">{settings.pitch.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Encoder Calibration */}
          <EncoderCalibration config={encoder} onChange={setEncoder} />
        </div>

        {/* Flip-Flop Rotation */}
        <FlipFlopConfig
          config={flipFlop}
          onChange={setFlipFlop}
          isConnected={isConnected}
          onSendCommand={onSendCommand}
        />
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subValue }: { icon: React.ReactNode; label: string; value: string; subValue: string }) {
  return (
    <div className="metric-card flex-col items-start gap-1">
      <div className="flex items-center gap-2 w-full">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{subValue}</div>
    </div>
  );
}
