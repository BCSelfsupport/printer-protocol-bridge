import { useEffect, useRef, useCallback } from 'react';
import { Printer } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
const shouldUseEmulator = () => printerEmulator.enabled || multiPrinterEmulator.enabled;

interface UseMasterSlaveSyncOptions {
  printers: Printer[];
  connectedPrinterId?: number | null;
  currentMessage?: string | null;
  messages?: { id: number; name: string }[];
}

/**
 * Hook that automatically synchronizes messages and message selection
 * from a master printer to its slave printers.
 * 
 * Sync behavior:
 * 1. When the master's active message changes → ^SM on all slaves
 * 2. When the master's message list changes → push new messages via ^NM to slaves
 */
export function useMasterSlaveSync({
  printers,
  connectedPrinterId,
  currentMessage,
  messages = [],
}: UseMasterSlaveSyncOptions) {
  const prevMessageRef = useRef<string | null>(null);
  const prevMessageListRef = useRef<string[]>([]);
  const syncingRef = useRef(false);

  // Find if the connected printer is a master
  const connectedPrinter = printers.find(p => p.id === connectedPrinterId);
  const isMaster = connectedPrinter?.role === 'master';

  // Get slaves for this master
  const getSlaves = useCallback(() => {
    if (!connectedPrinterId) return [];
    return printers.filter(
      p => p.role === 'slave' && p.masterId === connectedPrinterId && p.isAvailable
    );
  }, [printers, connectedPrinterId]);

  // Send a command to a specific printer (by IP/port)
  const sendCommandToPrinter = useCallback(async (
    printer: Printer,
    command: string
  ): Promise<boolean> => {
    if (shouldUseEmulator()) {
      const instance = multiPrinterEmulator.enabled
        ? multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port)
        : null;
      if (instance) {
        const result = instance.processCommand(command);
        return result.success;
      }
      return false;
    }

    if (isElectron && window.electronAPI) {
      try {
        // Use on-demand connection for the slave
        await window.electronAPI.printer.connect({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });
        const result = await window.electronAPI.printer.sendCommand(printer.id, command);
        // Disconnect after sending to avoid keeping sockets open
        await window.electronAPI.printer.disconnect(printer.id);
        return result?.success ?? false;
      } catch (e) {
        console.error(`[MasterSlaveSync] Failed to send "${command}" to ${printer.name}:`, e);
        return false;
      }
    }

    return false;
  }, []);

  // Sync message selection: when master's currentMessage changes, ^SM on all slaves
  useEffect(() => {
    if (!isMaster || !currentMessage || syncingRef.current) return;
    if (currentMessage === prevMessageRef.current) return;

    prevMessageRef.current = currentMessage;
    const slaves = getSlaves();
    if (slaves.length === 0) return;

    syncingRef.current = true;
    console.log(`[MasterSlaveSync] Syncing message selection "${currentMessage}" to ${slaves.length} slave(s)`);

    Promise.all(
      slaves.map(slave =>
        sendCommandToPrinter(slave, `^SM ${currentMessage}`)
          .then(ok => {
            console.log(`[MasterSlaveSync] ^SM ${currentMessage} → ${slave.name}: ${ok ? 'OK' : 'FAIL'}`);
          })
      )
    ).finally(() => {
      syncingRef.current = false;
    });
  }, [isMaster, currentMessage, getSlaves, sendCommandToPrinter]);

  // Sync message list: when master gets new messages, push them to slaves via ^NM
  useEffect(() => {
    if (!isMaster || syncingRef.current) return;

    const currentNames = messages.map(m => m.name).sort();
    const prevNames = prevMessageListRef.current;

    // Find new messages (in current but not in previous)
    const newMessages = currentNames.filter(n => !prevNames.includes(n));
    prevMessageListRef.current = currentNames;

    if (newMessages.length === 0) return;
    // Skip on first load (when prevNames was empty)
    if (prevNames.length === 0) return;

    const slaves = getSlaves();
    if (slaves.length === 0) return;

    syncingRef.current = true;
    console.log(`[MasterSlaveSync] Syncing ${newMessages.length} new message(s) to ${slaves.length} slave(s):`, newMessages);

    // For each new message, send a basic ^NM command to each slave
    // The message content sync uses a simple ^NM with just the name
    // (full field content would require reading from localStorage and building the full command)
    Promise.all(
      slaves.flatMap(slave =>
        newMessages.map(msgName =>
          sendCommandToPrinter(slave, `^NM ${msgName}`)
            .then(ok => {
              console.log(`[MasterSlaveSync] ^NM ${msgName} → ${slave.name}: ${ok ? 'OK' : 'FAIL'}`);
            })
        )
      )
    ).finally(() => {
      syncingRef.current = false;
    });
  }, [isMaster, messages, getSlaves, sendCommandToPrinter]);

  return {
    isMaster,
    slaveCount: isMaster ? getSlaves().length : 0,
    getSlaves,
    // Manual sync for the connected master
    syncAllMessages: useCallback(async () => {
      if (!isMaster) return;
      const slaves = getSlaves();
      if (slaves.length === 0) return;

      console.log(`[MasterSlaveSync] Full sync: ${messages.length} messages to ${slaves.length} slaves`);
      syncingRef.current = true;

      for (const slave of slaves) {
        for (const msg of messages) {
          await sendCommandToPrinter(slave, `^NM ${msg.name}`);
        }
        if (currentMessage) {
          await sendCommandToPrinter(slave, `^SM ${currentMessage}`);
        }
      }

      syncingRef.current = false;
      console.log('[MasterSlaveSync] Full sync complete');
    }, [isMaster, messages, currentMessage, getSlaves, sendCommandToPrinter]),

    // Sync a specific master's messages to its slaves (works for any master, not just connected)
    syncMaster: useCallback(async (masterId: number) => {
      const master = printers.find(p => p.id === masterId && p.role === 'master');
      if (!master) return;

      const slaves = printers.filter(
        p => p.role === 'slave' && p.masterId === masterId && p.isAvailable
      );
      if (slaves.length === 0) return;

      // Get the master's message list from its emulator instance or current state
      let masterMessages: string[] = [];
      let masterCurrentMsg: string | null = null;

      if (shouldUseEmulator()) {
        const instance = multiPrinterEmulator.enabled
          ? multiPrinterEmulator.getInstanceByIp(master.ipAddress, master.port)
          : null;
        if (instance) {
          const state = instance.getState();
          masterMessages = state.messages;
          masterCurrentMsg = state.currentMessage;
        }
      }

      // If connected to this master, use connection state messages
      if (masterId === connectedPrinterId) {
        masterMessages = messages.map(m => m.name);
        masterCurrentMsg = currentMessage ?? null;
      }

      if (masterMessages.length === 0 && !masterCurrentMsg) {
        console.log(`[MasterSlaveSync] No messages to sync from master ${master.name}`);
        return;
      }

      console.log(`[MasterSlaveSync] Syncing master "${master.name}" (${masterMessages.length} msgs) → ${slaves.length} slave(s)`);
      syncingRef.current = true;

      for (const slave of slaves) {
        for (const msgName of masterMessages) {
          await sendCommandToPrinter(slave, `^NM ${msgName}`);
        }
        if (masterCurrentMsg) {
          await sendCommandToPrinter(slave, `^SM ${masterCurrentMsg}`);
        }
      }

      syncingRef.current = false;
      console.log(`[MasterSlaveSync] Master "${master.name}" sync complete`);
    }, [printers, connectedPrinterId, messages, currentMessage, sendCommandToPrinter]),
  };
}
