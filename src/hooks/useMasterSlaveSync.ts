import { useEffect, useRef, useCallback } from 'react';
import { Printer, PrintSettings } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { printerTransport, isRelayMode, type TransportCommandOptions } from '@/lib/printerTransport';
import { isPresetMessage } from '@/lib/hardcodedMessages';
import { setPollingPaused } from '@/lib/pollingPause';
import { waitForSaveIdle } from '@/lib/saveBusy';
import { runFleetWriteExclusive, runPrinterWriteExclusive } from '@/lib/printerWriteQueue';


const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
const shouldUseEmulator = () => printerEmulator.enabled || multiPrinterEmulator.enabled;

interface UseMasterSlaveSyncOptions {
  printers: Printer[];
  connectedPrinterId?: number | null;
  currentMessage?: string | null;
  messages?: { id: number; name: string }[];
  getMessageContent?: (messageName: string) => MessageDetails | null;
  buildMessageCommands?: (
    messageName: string,
    fields: MessageDetails['fields'],
    templateValue?: string,
    isNew?: boolean,
    messageSettings?: {
      speed?: PrintSettings['speed'];
      rotation?: PrintSettings['rotation'];
      printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse' | 'Auto Encoder' | 'Auto Encoder Reverse';
    },
    counterConfigs?: NonNullable<MessageDetails['advancedSettings']>['counters'],
  ) => Promise<string[] | null> | string[] | null;
  currentSettings?: PrintSettings;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SAVE_ACK_MAX_WAIT_MS = 30000;
const SAVE_NM_IDLE_AFTER_DATA_MS = 1500;
const SAVE_FLUSH_IDLE_AFTER_DATA_MS = 5000;

type SequencedCommand = {
  command: string;
  delayAfterMs?: number;
};

const getCommandOptions = (command: string): TransportCommandOptions | undefined => {
  const trimmed = command.trim().toUpperCase();
  if (trimmed.startsWith('^NM ') || trimmed.startsWith('^NF ')) {
    return { maxWaitMs: SAVE_ACK_MAX_WAIT_MS, idleAfterDataMs: SAVE_NM_IDLE_AFTER_DATA_MS };
  }
  if (trimmed === '^SV') {
    return { maxWaitMs: SAVE_ACK_MAX_WAIT_MS, idleAfterDataMs: SAVE_FLUSH_IDLE_AFTER_DATA_MS };
  }
  return undefined;
};

const summarizeCommand = (command: string) => {
  const trimmed = command.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('^NM ')) {
    const header = trimmed.slice(4).split('^')[0] ?? '';
    const parts = header.split(';');
    return `^NM ${parts[4] || header || '(message)'}`;
  }
  if (upper.startsWith('^NF ')) return '^NF (field append)';
  if (upper.startsWith('^SM ')) return `^SM ${trimmed.slice(4)}`;
  if (upper.startsWith('^MD^TD')) return trimmed.replace(/;.*/, ';…');
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
};

const getSyncCommandDelay = (command: string, fieldCount: number) => {
  const trimmed = command.trim().toUpperCase();
  if (trimmed.startsWith('^NM ')) {
    if (fieldCount >= 10) return 12000;
    if (fieldCount >= 8) return 9000;
    if (fieldCount >= 6) return 7000;
    return Math.min(4000, 1000 + fieldCount * 250);
  }
  if (trimmed === '^SV') return 1500;
  return 300;
};

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
  getMessageContent,
  buildMessageCommands,
  currentSettings,
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

    // If this printer is the currently connected one, use the persistent
    // transport instead of opening a second TCP socket (BestCode printers
    // only support a single Telnet session on port 23).
    if (printer.id === connectedPrinterId) {
      try {
        const result = await printerTransport.sendCommand(printer.id, command);
        return result?.success ?? false;
      } catch (e) {
        console.error(`[MasterSlaveSync] Failed to send "${command}" to connected ${printer.name}:`, e);
        return false;
      }
    }

    // For non-connected printers, guard the whole connect → command → disconnect
    // transaction. Even single-command helpers must not overlap with a larger
    // sync/write sequence for the same fragile port-23 session.
    if (isRelayMode() || (isElectron && window.electronAPI)) {
      return runFleetWriteExclusive(() => runPrinterWriteExclusive(printer.id, async () => {
        try {
          const connectResult = await printerTransport.connect({ id: printer.id, ipAddress: printer.ipAddress, port: printer.port });
          if (!connectResult?.success) {
            console.warn(`[MasterSlaveSync] Connect failed for ${printer.name}: ${connectResult?.error ?? 'unknown'}`);
            return false;
          }
          const result = await printerTransport.sendCommand(printer.id, command, getCommandOptions(command));
          return result?.success ?? false;
        } catch (e) {
          console.error(`[MasterSlaveSync] Failed to send "${summarizeCommand(command)}" to ${printer.name}:`, e);
          return false;
        } finally {
          try { await printerTransport.disconnect(printer.id); } catch {}
        }
      }));
    }

    return false;
  }, [connectedPrinterId]);

  // Send a full write/select sequence through ONE guarded session per target
  // printer. This is the critical path for master→slave changes: do not open a
  // new Telnet connection for every ^NM/^SV/^SM command.
  const sendCommandSequenceToPrinter = useCallback(async (
    printer: Printer,
    commands: SequencedCommand[],
    traceLabel: string,
  ): Promise<{ success: boolean; failedIndex: number | null; failedCommand?: string; error?: string }> => {
    const sequence = commands
      .map((entry) => typeof entry === 'string' ? { command: entry } : entry)
      .filter((entry) => entry.command.trim().length > 0);

    if (sequence.length === 0) {
      return { success: true, failedIndex: null };
    }

    const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = Date.now();
    const logPrefix = `[MasterSlaveSync][${traceId}] ${traceLabel} → ${printer.name}`;
    console.log(`${logPrefix}: START ${sequence.length} command(s)`);

    const runCommand = async (command: string) => {
      const options = getCommandOptions(command);
      if (printer.id === connectedPrinterId) {
        return printerTransport.sendCommand(printer.id, command, options);
      }
      return printerTransport.sendCommand(printer.id, command, options);
    };

    if (shouldUseEmulator()) {
      const instance = multiPrinterEmulator.enabled
        ? multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port)
        : printerEmulator;
      if (!instance) {
        console.warn(`${logPrefix}: FAIL emulator instance not found`);
        return { success: false, failedIndex: 0, error: 'Emulator instance not found' };
      }
      for (let index = 0; index < sequence.length; index += 1) {
        const { command, delayAfterMs = 300 } = sequence[index];
        const result = instance.processCommand(command);
        console.log(`${logPrefix}: #${index + 1}/${sequence.length} ${summarizeCommand(command)} → ${result.success ? 'OK' : 'FAIL'}`);
        if (!result.success) {
          return { success: false, failedIndex: index, failedCommand: command, error: result.response };
        }
        if (delayAfterMs > 0) await delay(delayAfterMs);
      }
      console.log(`${logPrefix}: DONE ${Date.now() - startedAt}ms`);
      return { success: true, failedIndex: null };
    }

    const needsSession = printer.id !== connectedPrinterId && (isRelayMode() || isElectron);
    return runFleetWriteExclusive(() => runPrinterWriteExclusive(printer.id, async () => {
      try {
        if (needsSession) {
          const connectStarted = Date.now();
          const connectResult = await printerTransport.connect({
            id: printer.id,
            ipAddress: printer.ipAddress,
            port: printer.port,
          });
          console.log(`${logPrefix}: CONNECT ${connectResult?.success ? 'OK' : 'FAIL'} ${Date.now() - connectStarted}ms${connectResult?.error ? ` (${connectResult.error})` : ''}`);
          if (!connectResult?.success) {
            return { success: false, failedIndex: 0, failedCommand: sequence[0]?.command, error: connectResult?.error || 'Connect failed' };
          }
          await delay(300);
        }

        for (let index = 0; index < sequence.length; index += 1) {
          const { command, delayAfterMs = 300 } = sequence[index];
          const commandStarted = Date.now();
          const result = await runCommand(command);
          const response = result?.response ?? result?.error ?? '';
          const ok = !!result?.success;
          console.log(`${logPrefix}: #${index + 1}/${sequence.length} ${summarizeCommand(command)} → ${ok ? 'OK' : 'FAIL'} ${Date.now() - commandStarted}ms${response ? ` (${response.replace(/[\r\n]+/g, ' ').slice(0, 160)})` : ''}`);
          if (!ok) {
            return { success: false, failedIndex: index, failedCommand: command, error: response || 'Command failed' };
          }
          if (delayAfterMs > 0) await delay(delayAfterMs);
        }

        console.log(`${logPrefix}: DONE ${Date.now() - startedAt}ms`);
        return { success: true, failedIndex: null };
      } catch (error: any) {
        console.error(`${logPrefix}: ERROR`, error);
        return { success: false, failedIndex: 0, failedCommand: sequence[0]?.command, error: error?.message || 'Sequence failed' };
      } finally {
        if (needsSession) {
          try {
            await delay(500);
            await printerTransport.disconnect(printer.id);
            console.log(`${logPrefix}: DISCONNECT`);
          } catch (error) {
            console.warn(`${logPrefix}: DISCONNECT failed`, error);
          }
        }
      }
    }));
  }, [connectedPrinterId]);

  // Sync message selection: when master's currentMessage changes, push full content to slaves first, then ^SM.
  // Skip factory/preset messages (BestCode, Moba, etc.) — they already exist on slaves.
  useEffect(() => {
    if (!isMaster || !currentMessage || syncingRef.current) return;
    if (currentMessage === prevMessageRef.current) return;
    if (isPresetMessage(currentMessage)) {
      console.log(`[MasterSlaveSync] Skipping preset message selection "${currentMessage}"`);
      prevMessageRef.current = currentMessage;
      return;
    }

    prevMessageRef.current = currentMessage;
    const slaves = getSlaves();
    if (slaves.length === 0) return;

    syncingRef.current = true;
    console.log(`[MasterSlaveSync] Syncing message selection "${currentMessage}" to ${slaves.length} slave(s)`);


    (async () => {
      const idle = await waitForSaveIdle(20000);
      if (!idle) {
        console.warn(`[MasterSlaveSync] Aborting selection sync for "${currentMessage}" — save busy did not clear`);
        return;
      }
      setPollingPaused(true);
      const details = getMessageContent?.(currentMessage) ?? null;
      for (const slave of slaves) {
        const sequence: SequencedCommand[] = [];

        if (details && details.fields.length > 0 && buildMessageCommands) {
          const rotation = slave.rotation ?? 'Normal';
          // Per-printer expiry offset override — apply slave.expiryOffsetDays to
          // any expiry date field so each line gets its own offset on the HMI.
          const slaveOffset = slave.expiryOffsetDays;
          const slaveFields = slaveOffset === undefined
            ? details.fields
            : details.fields.map((f) => {
                const isExpiry = f.autoCodeFieldType?.startsWith('date_expiry')
                  || (f.autoCodeExpiryDays ?? 0) > 0;
                return isExpiry ? { ...f, autoCodeExpiryDays: slaveOffset } : f;
              });
          const rawCommands = await buildMessageCommands(
            currentMessage,
            slaveFields,
            details.templateValue,
            false,
            {
              speed: details.adjustSettings?.speed ?? details.settings?.speed ?? currentSettings?.speed ?? 'Fastest',
              rotation,
              printMode: details.settings?.printMode ?? 'Normal',
            },
            details.advancedSettings?.counters,
          );

          const commands = (rawCommands ?? []).filter((cmd) => !cmd.trim().toUpperCase().startsWith('^DM '));
          for (const cmd of commands) {
            sequence.push({ command: cmd, delayAfterMs: getSyncCommandDelay(cmd, details.fields.length) });
          }
        }

        sequence.push({ command: `^SM ${currentMessage}`, delayAfterMs: 800 });
        const result = await sendCommandSequenceToPrinter(slave, sequence, `select ${currentMessage}`);
        if (!result.success) {
          console.warn(`[MasterSlaveSync] Selection sync failed on ${slave.name}: ${summarizeCommand(result.failedCommand ?? '')} ${result.error ?? ''}`);
        }
        console.log(`[MasterSlaveSync] ^SM ${currentMessage} → ${slave.name} (${slave.rotation ?? 'Normal'}): ${result.success ? 'OK' : 'FAIL'}`);
      }
    })().finally(() => {
      setTimeout(() => setPollingPaused(false), 1000);
      syncingRef.current = false;
    });
  }, [isMaster, currentMessage, getSlaves, sendCommandSequenceToPrinter, getMessageContent, buildMessageCommands, currentSettings]);

  // Message content is pushed by Index.syncMessageToSlaves after save using the
  // full ^DM → ^NM → ^SV sequence. Do not also send a bare ^NM here: that can
  // leave slaves RAM-yellow and can race the master's save/restore flow.
  useEffect(() => {
    const currentNames = messages.map(m => m.name).sort();
    prevMessageListRef.current = currentNames;
  }, [messages]);

  return {
    isMaster,
    slaveCount: isMaster ? getSlaves().length : 0,
    getSlaves,
    sendCommandToPrinter,
    // Manual sync for the connected master
    syncAllMessages: useCallback(async () => {
      if (!isMaster) return;
      const slaves = getSlaves();
      if (slaves.length === 0) return;

      const syncMessages = messages.filter(m => !isPresetMessage(m.name));
      console.log(`[MasterSlaveSync] Full sync: ${syncMessages.length}/${messages.length} messages to ${slaves.length} slaves`);
      syncingRef.current = true;

      for (const slave of slaves) {
        const sequence: SequencedCommand[] = [];
        for (const msg of syncMessages) {
          sequence.push({ command: `^NM ${msg.name}`, delayAfterMs: getSyncCommandDelay(`^NM ${msg.name}`, 1) });
        }
        if (currentMessage && !isPresetMessage(currentMessage)) {
          sequence.push({ command: `^SM ${currentMessage}`, delayAfterMs: 800 });
        }
        await sendCommandSequenceToPrinter(slave, sequence, 'full sync');
      }

      syncingRef.current = false;
      console.log('[MasterSlaveSync] Full sync complete');
    }, [isMaster, messages, currentMessage, getSlaves, sendCommandSequenceToPrinter]),


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

      const syncMessages = masterMessages.filter(name => !isPresetMessage(name));
      const syncCurrentMsg = masterCurrentMsg && !isPresetMessage(masterCurrentMsg) ? masterCurrentMsg : null;

      if (syncMessages.length === 0 && !syncCurrentMsg) {
        console.log(`[MasterSlaveSync] No messages to sync from master ${master.name}`);
        return;
      }

      console.log(`[MasterSlaveSync] Syncing master "${master.name}" (${syncMessages.length}/${masterMessages.length} msgs) → ${slaves.length} slave(s)`);
      syncingRef.current = true;

      for (const slave of slaves) {
        const sequence: SequencedCommand[] = [];
        for (const msgName of syncMessages) {
          sequence.push({ command: `^NM ${msgName}`, delayAfterMs: getSyncCommandDelay(`^NM ${msgName}`, 1) });
        }
        if (syncCurrentMsg) {
          sequence.push({ command: `^SM ${syncCurrentMsg}`, delayAfterMs: 800 });
        }
        await sendCommandSequenceToPrinter(slave, sequence, `master ${master.name} sync`);
      }

      syncingRef.current = false;
      console.log(`[MasterSlaveSync] Master "${master.name}" sync complete`);
    }, [printers, connectedPrinterId, messages, currentMessage, sendCommandSequenceToPrinter]),


    // Broadcast a specific message to all slaves with optional per-printer User Define values
    // userDefineFieldNum: the 1-indexed absolute field number (from ^NM ordering) for the prompted field
    broadcastMessage: useCallback(async (
      masterId: number,
      messageName: string,
      slaveValues: { printerId: number; userDefineValue: string }[],
      userDefineFieldNum?: number,
    ) => {
      const master = printers.find(p => p.id === masterId && p.role === 'master');
      if (!master) throw new Error('Master not found');

      const slaves = printers.filter(
        p => p.role === 'slave' && p.masterId === masterId && p.isAvailable
      );
      if (slaves.length === 0) throw new Error('No online slaves');

      console.log(`[MasterSlaveSync] Broadcasting "${messageName}" to ${slaves.length} slave(s)`);
      syncingRef.current = true;

      for (const slave of slaves) {
        const sequence: SequencedCommand[] = [{ command: `^SM ${messageName}`, delayAfterMs: 800 }];

        // Send User Define value if provided
        // Per v2.6 §5.28.2, ^TD is a subcommand of ^MD (Message Data).
        // Format: ^MD^TDn;text where n = absolute field number in ^NM.
        const slaveVal = slaveValues.find(v => v.printerId === slave.id);
        if (slaveVal && slaveVal.userDefineValue.trim()) {
          const tdNum = userDefineFieldNum ?? 1;
          sequence.push({ command: `^MD^TD${tdNum};${slaveVal.userDefineValue.trim()}`, delayAfterMs: 500 });
        }
        const result = await sendCommandSequenceToPrinter(slave, sequence, `broadcast ${messageName}`);
        console.log(`[Broadcast] ${messageName} → ${slave.name}: ${result.success ? 'OK' : 'FAIL'}${result.error ? ` (${result.error})` : ''}`);
      }

      syncingRef.current = false;
      console.log(`[MasterSlaveSync] Broadcast complete`);
    }, [printers, sendCommandSequenceToPrinter]),

    // Get slaves for a specific master (utility for UI)
    getSlavesForMaster: useCallback((masterId: number) => {
      return printers.filter(
        p => p.role === 'slave' && p.masterId === masterId
      );
    }, [printers]),
  };
}
