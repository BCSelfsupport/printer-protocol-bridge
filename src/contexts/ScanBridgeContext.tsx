import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Printer, PrintMessage } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

/**
 * ScanBridgeContext
 *
 * Bridges the live printer-connection primitives from <Index /> into the
 * standalone /scan route so the Scan-to-Print wizard can drive the *real*
 * printer (or emulator) instead of mocked data.
 *
 * Architecture:
 *   1. <Index /> calls `publishScanBridge(value)` whenever its primitives
 *      change (printers list, connected printer, etc.).
 *   2. <ScanBridgeProvider /> (mounted in <App />) subscribes to the
 *      module-level singleton and re-renders consumers.
 *   3. /scan calls `useScanBridge()` to read the live data.
 *
 * This avoids calling `usePrinterConnection` twice (which would spawn a
 * second polling loop) while keeping <Index /> the single owner of the
 * connection state.
 *
 * If <Index /> hasn't mounted yet (e.g. /scan opened in isolation with no
 * app shell), the bridge is `null` and the page shows a "not connected"
 * state rather than crashing.
 */

export interface ScanBridge {
  printers: Printer[];
  connectedPrinterId: number | null;
  getMessagesForPrinter: (printer: Printer | null | undefined) => { id: number; name: string }[];
  getStoredMessage: (messageName: string, printer?: Printer | null) => MessageDetails | null;
  saveMessageContent: (
    messageName: string,
    fields: MessageDetails['fields'],
    templateValue?: string,
    isNew?: boolean,
    settings?: MessageDetails['settings'],
  ) => Promise<boolean>;
  selectMessage: (message: PrintMessage) => Promise<boolean>;
  resetCounter: (counterId: number, value: number) => Promise<void> | void;
  connectToPrinter: (printer: Printer) => Promise<unknown>;
  fetchMessageContent?: (messageName: string) => Promise<MessageDetails | null>;
}

// ─── Module-level singleton + subscriber list ────────────────────────────
let currentBridge: ScanBridge | null = null;
const subscribers = new Set<(b: ScanBridge | null) => void>();

export function publishScanBridge(value: ScanBridge | null) {
  currentBridge = value;
  subscribers.forEach((cb) => cb(value));
}

function subscribe(cb: (b: ScanBridge | null) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// ─── React context wrapper ───────────────────────────────────────────────
const ScanBridgeContext = createContext<ScanBridge | null>(null);

export function ScanBridgeProvider({ children }: { children: ReactNode }) {
  const [bridge, setBridge] = useState<ScanBridge | null>(currentBridge);

  useEffect(() => {
    setBridge(currentBridge);
    return subscribe(setBridge);
  }, []);

  return <ScanBridgeContext.Provider value={bridge}>{children}</ScanBridgeContext.Provider>;
}

export function useScanBridge(): ScanBridge | null {
  return useContext(ScanBridgeContext);
}
