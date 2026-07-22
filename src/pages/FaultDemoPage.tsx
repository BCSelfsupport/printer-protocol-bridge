import { FaultAlertDialog, PrinterFault } from "@/components/alerts/FaultAlertDialog";

const sampleFaults: PrinterFault[] = [
  {
    code: "01-0001",
    severity: "F",
    message: "Fluid not detected in gutter. Check gutter sensor and fluid supply.",
  },
];

export default function FaultDemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-8 text-foreground">
      <h1 className="mb-4 text-lg font-semibold">Fault dialog preview</h1>
      <p className="text-muted-foreground">This is how the gutter fault popup now renders.</p>
      <FaultAlertDialog faults={sampleFaults} isConnected={true} />
    </div>
  );
}
