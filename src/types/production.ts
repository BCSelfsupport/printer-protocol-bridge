export interface ProductionRun {
  id: string;
  printerId: number;
  printerName: string;
  messageName: string;
  startTime: number; // epoch ms
  endTime: number | null; // null = still running
  targetCount: number; // required production count
  actualCount: number; // what was actually produced
  // Downtime events during this run
  downtimeEvents: DowntimeEvent[];
}

export interface DowntimeEvent {
  id: string;
  startTime: number;
  endTime: number | null;
  reason: string; // e.g. 'printer_error', 'ink_empty', 'manual_stop'
}

export interface ProductionSnapshot {
  id: string;
  runId: string;
  timestamp: number;
  printCount: number;
  productCount: number;
}

export interface OEEMetrics {
  availability: number; // 0-100%
  performance: number;  // 0-100%
  oee: number;          // availability × performance / 100
  plannedTime: number;  // total planned production time (ms)
  runTime: number;      // actual run time minus downtime (ms)
  totalDowntime: number; // total downtime (ms)
  targetCount: number;
  actualCount: number;
}

export function calculateOEE(run: ProductionRun): OEEMetrics {
  const now = Date.now();
  const endTime = run.endTime ?? now;
  const plannedTime = endTime - run.startTime;

  // Calculate total downtime from events (jet stop / HV off periods)
  const totalDowntime = run.downtimeEvents.reduce((sum, evt) => {
    const dtEnd = evt.endTime ?? now;
    return sum + (dtEnd - evt.startTime);
  }, 0);

  const runTime = Math.max(0, plannedTime - totalDowntime);

  // Availability = Run Time / Planned Production Time
  const availability = plannedTime > 0 ? (runTime / plannedTime) * 100 : 100;

  // Performance = Actual Count / Target Count
  const performance = run.targetCount > 0
    ? Math.min(100, (run.actualCount / run.targetCount) * 100)
    : 0;

  // OEE = Availability × Performance (quality assumed 100%)
  const oee = (availability * performance) / 100;

  return {
    availability,
    performance,
    oee,
    plannedTime,
    runTime,
    totalDowntime,
    targetCount: run.targetCount,
    actualCount: run.actualCount,
  };
}
