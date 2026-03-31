import { useEffect, useRef } from 'react';
import { useLicense } from '@/contexts/LicenseContext';
import type { Printer, PrinterStatus, PrinterMetrics } from '@/types/printer';

const PUSH_INTERVAL_MS = 30_000; // Push every 30 seconds
const REGISTER_INTERVAL_MS = 5 * 60_000; // Re-register every 5 minutes

/**
 * Pushes local printer telemetry to the Fleet Telemetry cloud database
 * when a license key is active and printers are connected.
 * 
 * This solves the fundamental problem: cloud edge functions cannot reach
 * printers on a customer's LAN. Instead, the app (running on the same
 * network) collects data locally and pushes it up.
 */
export function useFleetTelemetryPush(options: {
  printers: Printer[];
  connectedPrinterId: number | null;
  status: PrinterStatus | null;
  metrics: PrinterMetrics | null;
}) {
  const { printers, connectedPrinterId, status, metrics } = options;
  const statusRef = useRef(status);
  statusRef.current = status;
  const { productKey, isActivated, tier } = useLicense();

  // Track registered printer IDs (fleet DB UUID) so we can push telemetry
  const registeredPrinters = useRef<Map<number, string>>(new Map()); // local id → fleet printer UUID
  const lastRegisterTime = useRef<number>(0);

  const fleetUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fleet-monitoring`;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Register printers with fleet
  useEffect(() => {
    if (!isActivated || !productKey || tier === 'lite') return;

    const registerAll = async () => {
      const now = Date.now();
      if (now - lastRegisterTime.current < REGISTER_INTERVAL_MS && registeredPrinters.current.size > 0) return;

      for (const printer of printers) {
        // Only register printers that are available or connected
        if (!printer.isAvailable && !printer.isConnected) continue;

        try {
          const res = await fetch(`${fleetUrl}?action=register-printer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: apiKey,
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              product_key: productKey,
              printer_name: printer.name,
              ip_address: printer.ipAddress,
              port: printer.port,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.printer_id) {
              registeredPrinters.current.set(printer.id, data.printer_id);
              console.log('[FleetPush] Registered printer', printer.name, '→', data.printer_id);
            }
          }
        } catch (err) {
          console.warn('[FleetPush] Failed to register printer', printer.name, err);
        }
      }

      lastRegisterTime.current = now;
    };

    registerAll();
    const interval = setInterval(registerAll, REGISTER_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActivated, productKey, tier, printers, fleetUrl, apiKey]);

  // Push telemetry for the connected printer
  useEffect(() => {
    if (!isActivated || !productKey || tier === 'lite') return;
    if (!connectedPrinterId || !status) return;

    const pushTelemetry = async () => {
      const fleetPrinterId = registeredPrinters.current.get(connectedPrinterId);
      if (!fleetPrinterId) {
        console.log('[FleetPush] No fleet ID for printer', connectedPrinterId, '— skipping push');
        return;
      }

      const payload: Record<string, any> = {
        printer_id: fleetPrinterId,
        ink_level: status.inkLevel || 'UNKNOWN',
        makeup_level: status.makeupLevel || 'UNKNOWN',
        print_count: status.printCount ?? 0,
        current_message: status.currentMessage || null,
        jet_running: status.jetRunning ?? false,
        hv_on: status.printOn ?? false,
      };

      // Add metrics if available
      if (metrics) {
        payload.pressure = metrics.pressure ?? null;
        payload.viscosity = metrics.viscosity ?? null;
        payload.modulation = metrics.modulation ?? null;
        payload.charge = metrics.charge ?? null;
        payload.rps = metrics.rps ?? null;
        payload.phase_qual = metrics.phaseQual ?? null;
        payload.printhead_temp = metrics.printheadTemp ?? null;
        payload.electronics_temp = metrics.electronicsTemp ?? null;
        payload.power_hours = metrics.powerHours ?? null;
        payload.stream_hours = metrics.streamHours ?? null;
      }

      try {
        const res = await fetch(`${fleetUrl}?action=push-telemetry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn('[FleetPush] Telemetry push failed:', err);
        } else {
          console.log('[FleetPush] Telemetry pushed for printer', connectedPrinterId);
        }
      } catch (err) {
        console.warn('[FleetPush] Network error pushing telemetry:', err);
      }
    };

    // Push immediately, then on interval
    pushTelemetry();
    const interval = setInterval(pushTelemetry, PUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActivated, productKey, tier, connectedPrinterId, status, metrics, fleetUrl, apiKey]);
}
