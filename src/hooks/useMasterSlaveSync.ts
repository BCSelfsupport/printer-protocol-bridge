import { useEffect, useRef, useCallback } from 'react';
import { Printer, PrintSettings } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { printerTransport, isRelayMode, type TransportCommandOptions } from '@/lib/printerTransport';
import { isPresetMessage } from '@/lib/hardcodedMessages';
import { setPollingPaused } from '@/lib/pollingPause';
import { beginSaveBusy, waitForSaveIdle } from '@/lib/saveBusy';
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
  /**
   * Called after every slave sync attempt (including offline/skipped) so the
   * app can flip the OUT OF SYNC badge without silently dropping unreachable
   * slaves. Reason is 'ok' on success, otherwise a short failure tag
   * ('offline', 'timeout', 'rejected', etc.).
   */
  /**
   * Called after every slave sync attempt (including offline/skipped) so the
   * app can flip the OUT OF SYNC badge and update currentMessage. `verifiedMessage`
   * is the message name the printer confirmed via `^SM` read-back — non-null ONLY
   * when the printer actually acknowledged the switch. Never set currentMessage
   * from the requested value; always use verifiedMessage.
   */
  onSlaveSyncOutcome?: (
    slaveId: number,
    ok: boolean,
    reason: string,
    messageName: string,
    verifiedMessage?: string | null,
  ) => void;
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

const isSaveCommand = (command: string) => {
  const trimmed = command.trim().toUpperCase();
  return trimmed.startsWith('^NM ') || trimmed.startsWith('^NF ') || trimmed === '^SV';
};

const isProtocolFailureResponse = (rawResponse?: string) => {
  if (!rawResponse) return false;
  const upper = rawResponse.toUpperCase();
  return /\?\s*\d+\s*:/.test(upper)
    || /COMMAND\s+FAILED/.test(upper)
    || /\bERROR\b/.test(upper)
    || /\bERR\s*\[\s*[1-9]\d*\s*\]/.test(upper)
    || /\bFAILED\b/.test(upper)
    || /\bCANNOT\b/.test(upper);
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
  onSlaveSyncOutcome,
}: UseMasterSlaveSyncOptions) {
  const prevMessageRef = useRef<string | null>(null);
  const primedMessageRef = useRef(false);
  const prevMessageListRef = useRef<string[]>([]);
  const syncingRef = useRef(false);
  const pendingMessageRef = useRef<string | null>(null);
  const runSelectionSyncRef = useRef<((msg: string) => void) | null>(null);
  const outcomeRef = useRef(onSlaveSyncOutcome);
  useEffect(() => { outcomeRef.current = onSlaveSyncOutcome; }, [onSlaveSyncOutcome]);

  // Find if the connected printer is a master
  const connectedPrinter = printers.find(p => p.id === connectedPrinterId);
  const isMaster = connectedPrinter?.role === 'master';

  // Reset the selection-sync primer when master identity changes so the
  // first message on a fresh master isn't blindly pushed to slaves.
  useEffect(() => {
    primedMessageRef.current = false;
    prevMessageRef.current = null;
  }, [connectedPrinterId, isMaster]);

  // Get ONLINE slaves for this master — used for actual write attempts.
  const getSlaves = useCallback(() => {
    if (!connectedPrinterId) return [];
    return printers.filter(
      p => p.role === 'slave' && p.masterId === connectedPrinterId && p.isAvailable
    );
  }, [printers, connectedPrinterId]);

  // Get ALL slaves for this master — including offline. Used to flag
  // unreachable slaves as OUT OF SYNC instead of silently skipping them.
  const getAllSlavesForMaster = useCallback(() => {
    if (!connectedPrinterId) return [];
    return printers.filter(
      p => p.role === 'slave' && p.masterId === connectedPrinterId
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
    const sequence = commands.filter((entry) => entry.command.trim().length > 0);

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
        const ok = result.success && !isProtocolFailureResponse(result.response);
        console.log(`${logPrefix}: #${index + 1}/${sequence.length} ${summarizeCommand(command)} → ${ok ? 'OK' : 'FAIL'}${result.response ? ` (${result.response.replace(/[\r\n]+/g, ' ').slice(0, 160)})` : ''}`);
        if (!ok) {
          return { success: false, failedIndex: index, failedCommand: command, error: result.response };
        }
        if (delayAfterMs > 0) await delay(delayAfterMs);
      }
      console.log(`${logPrefix}: DONE ${Date.now() - startedAt}ms`);
      return { success: true, failedIndex: null };
    }

    const needsSession = printer.id !== connectedPrinterId && (isRelayMode() || isElectron);
    return runFleetWriteExclusive(() => runPrinterWriteExclusive(printer.id, async () => {
      const hasSaveCommand = sequence.some(({ command }) => isSaveCommand(command));
      let releaseSaveBusy = () => {};
      try {
        if (hasSaveCommand) {
          const idle = await waitForSaveIdle(20000);
          if (!idle) {
            console.warn(`${logPrefix}: ABORT save busy did not clear`);
            return { success: false, failedIndex: 0, failedCommand: sequence[0]?.command, error: 'Save busy did not clear' };
          }
          releaseSaveBusy = beginSaveBusy();
        }

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
          const ok = !!result?.success && !isProtocolFailureResponse(response);
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
        releaseSaveBusy();
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
  // Factory/preset messages already exist on slaves, so only send ^SM for those.
  const runSelectionSync = useCallback((messageName: string) => {
    if (syncingRef.current) {
      // A sync is already running. Remember the newest requested message so
      // we drain it as soon as the current run finishes. This is the fix for
      // "some slaves get the old message, some get nothing" when the user
      // changes selection mid-sync.
      pendingMessageRef.current = messageName;
      console.log(`[MasterSlaveSync] Queued "${messageName}" — sync already in progress`);
      return;
    }

    const onlineSlaves = getSlaves();
    const allSlaves = getAllSlavesForMaster();
    const offlineSlaves = allSlaves.filter(s => !s.isAvailable);

    // Immediately flag offline slaves as OUT OF SYNC — they cannot receive
    // the selection change, so their last-known-message is now stale.
    for (const s of offlineSlaves) {
      console.warn(`[MasterSlaveSync] Slave ${s.name} is OFFLINE — flagging OUT OF SYNC for "${messageName}"`);
      outcomeRef.current?.(s.id, false, 'offline', messageName);
    }

    if (onlineSlaves.length === 0) {
      if (offlineSlaves.length === 0) return;
      // Nothing to actually push, but we did flag offline slaves above.
      return;
    }

    syncingRef.current = true;
    prevMessageRef.current = messageName;
    console.log(`[MasterSlaveSync] Syncing message selection "${messageName}" to ${onlineSlaves.length} slave(s) (${offlineSlaves.length} offline flagged)`);

    (async () => {
      const idle = await waitForSaveIdle(20000);
      if (!idle) {
        console.warn(`[MasterSlaveSync] Aborting selection sync for "${messageName}" — save busy did not clear`);
        return;
      }
      setPollingPaused(true);
      const details = getMessageContent?.(messageName) ?? null;
      for (const slave of onlineSlaves) {
        // If the user picked a newer message while we were mid-fleet, abandon
        // the remaining slaves for the stale target so we can start the new
        // one immediately — the newer selection is what the operator wants.
        if (pendingMessageRef.current && pendingMessageRef.current !== messageName) {
          console.log(`[MasterSlaveSync] Aborting remaining slaves for "${messageName}" — newer selection "${pendingMessageRef.current}" pending`);
          break;
        }

        const sequence: SequencedCommand[] = [];

        if (!isPresetMessage(messageName) && details && details.fields.length > 0 && buildMessageCommands) {
          const rotation = slave.rotation ?? 'Normal';
          const slaveOffset = slave.expiryOffsetDays;
          const slaveFields = slaveOffset === undefined
            ? details.fields
            : details.fields.map((f) => {
                const isExpiry = f.autoCodeFieldType?.startsWith('date_expiry')
                  || (f.autoCodeExpiryDays ?? 0) > 0;
                return isExpiry ? { ...f, autoCodeExpiryDays: slaveOffset } : f;
              });
          const rawCommands = await buildMessageCommands(
            messageName,
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

        sequence.push({ command: `^SM ${messageName}`, delayAfterMs: 800 });
        const result = await sendCommandSequenceToPrinter(slave, sequence, `select ${messageName}`);
        if (!result.success) {
          console.warn(`[MasterSlaveSync] Selection sync failed on ${slave.name}: ${summarizeCommand(result.failedCommand ?? '')} ${result.error ?? ''}`);
          outcomeRef.current?.(slave.id, false, result.error ? String(result.error).slice(0, 40) : 'rejected', messageName);
        } else {
          outcomeRef.current?.(slave.id, true, 'ok', messageName);
        }
        console.log(`[MasterSlaveSync] ^SM ${messageName} → ${slave.name} (${slave.rotation ?? 'Normal'}): ${result.success ? 'OK' : 'FAIL'}`);
      }
    })().finally(() => {
      setTimeout(() => setPollingPaused(false), 1000);
      syncingRef.current = false;

      // Drain any queued selection that arrived while we were busy.
      const pending = pendingMessageRef.current;
      if (pending && pending !== prevMessageRef.current) {
        pendingMessageRef.current = null;
        // Defer to a fresh microtask so state settles first.
        setTimeout(() => runSelectionSyncRef.current?.(pending), 0);
      } else {
        pendingMessageRef.current = null;
      }
    });
  }, [getSlaves, getAllSlavesForMaster, sendCommandSequenceToPrinter, getMessageContent, buildMessageCommands, currentSettings]);

  // Keep an imperative handle so the drain step at the end of a run can call
  // the latest version of runSelectionSync without stale closure issues.
  useEffect(() => {
    runSelectionSyncRef.current = runSelectionSync;
  }, [runSelectionSync]);

  useEffect(() => {
    if (!isMaster || !currentMessage) return;

    // Prime on first run for this master session so we do NOT push the
    // currently-loaded message to slaves on mount/reconnect — only real
    // user-driven selection changes should trigger a sync.
    if (!primedMessageRef.current) {
      primedMessageRef.current = true;
      prevMessageRef.current = currentMessage;
      return;
    }

    if (currentMessage === prevMessageRef.current && !syncingRef.current) return;

    runSelectionSync(currentMessage);
  }, [isMaster, currentMessage, runSelectionSync]);

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

      try {
        for (const slave of slaves) {
          const sequence: SequencedCommand[] = [];
          for (const msg of syncMessages) {
            sequence.push({ command: `^NM ${msg.name}`, delayAfterMs: getSyncCommandDelay(`^NM ${msg.name}`, 1) });
          }
          if (currentMessage) {
            sequence.push({ command: `^SM ${currentMessage}`, delayAfterMs: 800 });
          }
          await sendCommandSequenceToPrinter(slave, sequence, 'full sync');
        }
      } finally {
        syncingRef.current = false;
      }

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
      const syncCurrentMsg = masterCurrentMsg || null;

      if (syncMessages.length === 0 && !syncCurrentMsg) {
        console.log(`[MasterSlaveSync] No messages to sync from master ${master.name}`);
        return;
      }

      console.log(`[MasterSlaveSync] Syncing master "${master.name}" (${syncMessages.length}/${masterMessages.length} msgs) → ${slaves.length} slave(s)`);
      syncingRef.current = true;

      try {
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
      } finally {
        syncingRef.current = false;
      }

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

      try {
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
      } finally {
        syncingRef.current = false;
      }

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
