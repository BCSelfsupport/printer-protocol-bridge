import type { Printer, PrinterStatus, PrinterMetrics } from '@/types/printer';

/**
 * Fleet Telemetry Push — DISABLED.
 *
 * Background HTTP pushes (register-printer / push-telemetry) were landing
 * inside the printer's ^NM digest window and causing prompt-save lockups,
 * especially at scale (13 printers). Per user decision, fleet telemetry is
 * shelved as a wishlist item; priority is a rock-solid production save flow.
 *
 * This hook is intentionally a no-op. The signature is preserved so callers
 * don't need to change. To re-enable, restore the previous implementation
 * from git history and re-verify against the Dozen12 baseline
 * (mem://features/message-persistence/dozen12-validation).
 */
export function useFleetTelemetryPush(_options: {
  printers: Printer[];
  connectedPrinterId: number | null;
  status: PrinterStatus | null;
  metrics: PrinterMetrics | null;
}) {
  // no-op
}
