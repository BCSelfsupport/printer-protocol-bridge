import { createContext, useContext, ReactNode } from 'react';
import type { Printer, PrintMessage } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

/**
 * ScanBridgeContext
 *
 * Bridges the live printer-connection primitives from <Index /> into the
 * standalone /scan route so the Scan-to-Print wizard can drive the *real*
 * printer (or emulator) instead of mocked data.
 *
 * The `/scan` page consumes this context when it renders inside the same
 * React tree as <Index /> (i.e. desktop, dev phone overlay iframe pointing
 * at our own origin, or a real mobile PWA after the bootstrap completes).
 *
 * If the context is missing (e.g. /scan opened in isolation with no app
 * shell), the page falls back to a "not connected" state rather than
 * crashing.
 */

export interface ScanBridge {
  /** All known printers (online + offline + emulator). */
  printers: Printer[];

  /** The currently connected printer (drives saveMessageContent gating). */
  connectedPrinterId: number | null;

  /**
   * Returns the message list for a given printer.
   * - For the connected printer: live ^LM data
   * - For an emulator instance: that instance's stored messages
   * - For other real printers: empty (must connect first)
   */
  getMessagesForPrinter: (printer: Printer | null | undefined) => { id: number; name: string }[];

  /**
   * Returns the cached/parsed message details (fields, template, settings).
   * Falls back through slave→master→connected printer storage scopes.
   */
  getStoredMessage: (messageName: string, printer?: Printer | null) => MessageDetails | null;

  /**
   * Atomic save: ^DM + ^NM + ^SV, with active-message switch-away protection.
   * Only works against the currently connected printer.
   */
  saveMessageContent: (
    messageName: string,
    fields: MessageDetails['fields'],
    templateValue?: string,
    isNew?: boolean,
    settings?: MessageDetails['settings'],
  ) => Promise<boolean>;

  /** Send ^SM to select a message on the currently connected printer. */
  selectMessage: (message: PrintMessage) => Promise<boolean>;

  /** Reset (or set) a counter on the connected printer. counterId 0 = first counter. */
  resetCounter: (counterId: number, value: number) => Promise<void> | void;

  /** Switch the live connection to a different printer. */
  connectToPrinter: (printer: Printer) => Promise<unknown>;

  /** Force a fresh fetch of message content from the printer (^LF). */
  fetchMessageContent?: (messageName: string) => Promise<MessageDetails | null>;
}

const ScanBridgeContext = createContext<ScanBridge | null>(null);

export function ScanBridgeProvider({
  value,
  children,
}: {
  value: ScanBridge;
  children: ReactNode;
}) {
  return <ScanBridgeContext.Provider value={value}>{children}</ScanBridgeContext.Provider>;
}

/** Returns the bridge if available; null when /scan is mounted standalone. */
export function useScanBridge(): ScanBridge | null {
  return useContext(ScanBridgeContext);
}
