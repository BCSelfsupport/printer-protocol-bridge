import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CountdownType } from '@/hooks/useJetCountdown';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { getModelCapabilities } from '@/lib/modelCapabilities';
import { setPollingPaused, waitForPollingIdle } from '@/lib/pollingPause';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { NavItem } from '@/components/layout/BottomNav';
import { Dashboard } from '@/components/screens/Dashboard';
import { PrintersScreen } from '@/components/screens/PrintersScreen';
import { MessagesScreen } from '@/components/screens/MessagesScreen';
import { EditMessageScreen, MessageDetails } from '@/components/screens/EditMessageScreen';
import { PrintSettings } from '@/types/printer';
import { AdjustDialog } from '@/components/adjust/AdjustDialog';
import { SetupScreen } from '@/components/screens/SetupScreen';
import { ServiceScreen } from '@/components/screens/ServiceScreen';
import { CleanScreen } from '@/components/screens/CleanScreen';
import { NetworkConfigScreen } from '@/components/screens/NetworkConfigScreen';
import { RelayConnectDialog } from '@/components/relay/RelayConnectDialog';
import { ConsumablesScreen } from '@/components/screens/ConsumablesScreen';
import { ReportsScreen } from '@/components/screens/ReportsScreen';
import { DataSourceScreen } from '@/components/screens/DataSourceScreen';
import { LowStockAlert, LowStockAlertData } from '@/components/consumables/LowStockAlert';
import { WireCableScreen } from '@/components/screens/WireCableScreen';
import { TrainingVideosScreen } from '@/components/screens/TrainingVideosScreen';
import { LicenseActivationDialog } from '@/components/license/LicenseActivationDialog';
import { FaultAlertDialog } from '@/components/alerts/FaultAlertDialog';
import { PausePollingButton } from '@/components/printers/PausePollingButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { SignInDialog } from '@/components/printers/SignInDialog';
import { HelpDialog } from '@/components/help/HelpDialog';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';
import { useJetCountdown } from '@/hooks/useJetCountdown';
import { useMessageStorage, isReadOnlyMessage } from '@/hooks/useMessageStorage';
import { useConsumableStorage } from '@/hooks/useConsumableStorage';
import { DevPanel } from '@/components/dev/DevPanel';
import { DevSignInDialog } from '@/components/dev/DevSignInDialog';
import { RecordingOverlay } from '@/components/dev/RecordingOverlay';
import { useScreenRecorder } from '@/hooks/useScreenRecorder';
import { useLicense } from '@/contexts/LicenseContext';
import { PrintMessage, Printer } from '@/types/printer';
import { useMasterSlaveSync } from '@/hooks/useMasterSlaveSync';
import { useProductionStorage } from '@/hooks/useProductionStorage';
import { logConsumption } from '@/lib/consumptionTracker';
import { useFleetTelemetryPush } from '@/hooks/useFleetTelemetryPush';
import { UserDefineEntryDialog, UserDefinePrompt } from '@/components/messages/UserDefineEntryDialog';
import { isRelayMode, printerTransport } from '@/lib/printerTransport';
import { buildTokenMap, resolveAllFields } from '@/lib/tokenResolver';
import { runFleetWriteExclusive, runPrinterWriteExclusive } from '@/lib/printerWriteQueue';
import { beginSaveBusy, waitForSaveIdle } from '@/lib/saveBusy';
import { isPresetMessage } from '@/lib/hardcodedMessages';



// Dev panel can be shown in dev mode OR when signed in with CITEC password

type ScreenType = NavItem | 'network' | 'control' | 'editMessage' | 'consumables' | 'reports' | 'datasource' | 'wirecable' | 'training';

const isTransportCommandFailure = (rawResponse?: string) => {
  if (!rawResponse) return false;
  const upper = rawResponse.toUpperCase();
  return /\?\s*\d+\s*:/.test(upper)
    || /COMMAND\s+FAILED/.test(upper)
    || /\bERROR\b/.test(upper)
    || /\bERR\s*\[\s*\d+\s*\]/.test(upper)
    || /\bFAILED\b/.test(upper)
    || /\bCANNOT\b/.test(upper);
};

type SequencedPrinterCommand = string | {
  command: string;
  delayAfterMs?: number;
};

const MESSAGE_RELOAD_SETTLE_MS = 900;
const SAVE_PUSH_SETTLE_MS = 1500;
const SAVE_ACK_MAX_WAIT_MS = 30000;
const SAVE_NM_IDLE_AFTER_DATA_MS = 1500;
const SAVE_FLUSH_IDLE_AFTER_DATA_MS = 5000;
const SAVE_PENDING_ACK_EXTRA_SETTLE_MS = 3000;

const hasCompleteSaveAck = (rawResponse?: string): boolean => {
  const cleaned = Array.from(rawResponse ?? '')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  const upper = cleaned.toUpperCase();
  return upper.includes('COMMAND SUCCESSFUL') || upper === 'OK' || upper === 'SUCCESS';
};

const isSaveSequenceCommand = (command: string) => {
  const trimmed = command.trim().toUpperCase();
  return trimmed.startsWith('^NM ') || trimmed.startsWith('^NF ') || trimmed === '^SV';
};

const getSaveCommandDelay = (command: string, fieldCount: number) => {
  const trimmed = command.trim().toUpperCase();
  if (trimmed.startsWith('^NM ')) {
    if (fieldCount >= 10) return 12000;
    if (fieldCount >= 8) return 9000;
    if (fieldCount >= 6) return 7000;
    return Math.min(4000, 1000 + fieldCount * 250);
  }
  if (trimmed.startsWith('^NF ')) return 1500;
  if (trimmed === '^SV') return SAVE_PUSH_SETTLE_MS;
  return 300;
};

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [devPanelOpen, setDevPanelOpen] = useState(false);

  // Screen recorder: auto-close Dev Panel when recording starts
  const screenRecorder = useScreenRecorder(useCallback(() => {
    setDevPanelOpen(false);
  }, []));
  const [devPanelTab, setDevPanelTab] = useState<string | undefined>(undefined);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isDevSignedIn, setIsDevSignedIn] = useState(false);
  const [devSignInDialogOpen, setDevSignInDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PrintMessage | null>(null);
  const [isCreatingNewMessage, setIsCreatingNewMessage] = useState(false);
  const [messagePreset, setMessagePreset] = useState<'metrc-retail-id' | undefined>(undefined);
  // Control whether to auto-open the new message dialog
  const [openNewDialogOnMount, setOpenNewDialogOnMount] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [relayDialogOpen, setRelayDialogOpen] = useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [slaveBlockDialogOpen, setSlaveBlockDialogOpen] = useState(false);
  const [slaveBlockPrinterName, setSlaveBlockPrinterName] = useState('');
  
  
  
  // Local message storage (persists to localStorage, scoped by printer ID)
  const { saveMessage, getMessage, deleteMessage: deleteStoredMessage, setPrinterId: setStoragePrinterId, saveToPcLibrary, getAllPcLibraryMessages, getPcLibraryMessages, deleteFromPcLibrary, getSwapSlot, setSwapSlot } = useMessageStorage();
  
  // Consumable storage
  const consumableStorage = useConsumableStorage();
  
  // Production storage (IndexedDB)
  const productionStorage = useProductionStorage();
  
  
  const {
    printers,
    connectionState,
    connect,
    disconnect,
    startPrint,
    stopPrint,
    jetStop,
    jetStart,
    updateSettings,
    selectMessage,
    signIn,
    signOut,
    addPrinter,
    removePrinter,
    updatePrinter,
    reorderPrinters,
    setServiceScreenOpen,
    setControlScreenOpen,
    addMessage,
    createMessageOnPrinter,
    saveMessageContent,
    updateMessage,
    deleteMessage,
    resetCounter,
    resetAllCounters,
    queryCounters,
    saveGlobalAdjust,
    saveMessageSettings,
    queryPrintSettings,
    sendCommand,
    queryPrinterMetrics,
    checkPrinterStatus,
    isChecking,
    refreshPolling,
    activeFaults,
    fetchMessageContent,
    buildMessageCommands,
  } = usePrinterConnection();
  
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
  const selectedPrinter = selectedPrinterId != null ? printers.find((printer) => printer.id === selectedPrinterId) ?? null : null;

  /** Get message list for a specific printer — uses emulator state if available, else falls back to connected printer's list */
  const getMessagesForPrinter = useCallback((printer: Printer | null | undefined): { id: number; name: string }[] => {
    if (!printer) return connectionState.messages;
    // If this is the connected printer, use live data
    if (printer.id === connectionState.connectedPrinter?.id) return connectionState.messages;
    // In emulator mode, query the specific emulator instance
    if (multiPrinterEmulator.enabled) {
      const instance = multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port);
      if (instance) {
        const state = instance.getState();
        return state.messages.map((name: string, idx: number) => ({ id: idx + 1, name }));
      }
    }
    // For real printers we don't have their message list unless connected
    return [];
  }, [connectionState.messages, connectionState.connectedPrinter?.id]);
  // Push telemetry to Fleet Telemetry cloud when license is active
  useFleetTelemetryPush({
    printers,
    connectedPrinterId,
    status: connectionState.status,
    metrics: connectionState.metrics,
  });

  // Keep message storage scoped to the connected printer
  // Exit edit mode when switching printers so we don't appear to edit
  // a message belonging to a different printer.
  useEffect(() => {
    if (connectedPrinterId !== null) {
      setStoragePrinterId(connectedPrinterId);
    }
    // If we're on the edit screen, go back to home when printer changes
    if (currentScreen === 'editMessage') {
      setCurrentScreen('home');
      setEditingMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedPrinterId]);

  
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Auto-sync: fetch message content from printer for any messages not yet in localStorage.
  // Runs when the message list changes (from ^LM polling) while connected.
  const syncingRef = useRef(false);
  const syncedMessagesRef = useRef<Set<string>>(new Set());
  // Track messages recently saved from the editor — skip auto-sync overwrite for these
  const normalizeMessageForPrinter = useCallback((details: MessageDetails): MessageDetails => ({
    ...details,
    fields: details.fields
      .filter((field) => {
        if (field.type === 'text' || field.type === 'userdefine') {
          return field.data.length > 0;
        }
        return true;
      })
      .map((field, index) => {
        const hasExpiryOffset = field.autoCodeFieldType?.startsWith('date_expiry')
          || (field.autoCodeExpiryDays ?? 0) > 0;
        const normalizedAutoCodeFieldType = field.autoCodeFieldType?.startsWith('date_')
          ? hasExpiryOffset
            ? field.autoCodeFieldType.replace(/^date_normal_/, 'date_expiry_')
            : field.autoCodeFieldType.replace(/^date_expiry_/, 'date_normal_')
          : field.autoCodeFieldType;

        return {
          ...field,
          id: index + 1,
          autoCodeFieldType: normalizedAutoCodeFieldType,
        };
      }),
  }), []);

  const buildEffectiveMessageDependentSettings = useCallback((details: MessageDetails) => {
    const effectiveSpeed = details.adjustSettings?.speed
      ?? details.settings?.speed
      ?? connectionState.settings.speed;
    const effectiveRotation = details.adjustSettings?.rotation
      ?? details.settings?.rotation
      ?? connectionState.settings.rotation;
    const effectivePrintMode = details.settings?.printMode ?? 'Normal';

    const fullAdjustSettings: PrintSettings = {
      ...connectionState.settings,
      width: details.adjustSettings?.width ?? connectionState.settings.width,
      height: details.adjustSettings?.height ?? connectionState.settings.height,
      delay: details.adjustSettings?.delay ?? connectionState.settings.delay,
      bold: details.adjustSettings?.bold ?? connectionState.settings.bold,
      gap: details.adjustSettings?.gap ?? connectionState.settings.gap,
      pitch: details.adjustSettings?.pitch ?? connectionState.settings.pitch,
      speed: effectiveSpeed,
      rotation: effectiveRotation,
    };

    return {
      fullAdjustSettings,
      perMessageSettings: {
        speed: effectiveSpeed,
        rotation: effectiveRotation,
        printMode: effectivePrintMode,
      },
    };
  }, [connectionState.settings]);

  const buildMessageDependentCommandSequence = useCallback(({
    adjustSettings,
    fullAdjustSettings,
    perMessageSettings,
    includeMessageSettings,
  }: {
    adjustSettings?: MessageDetails['adjustSettings'] | null;
    fullAdjustSettings: PrintSettings;
    perMessageSettings: {
      speed: PrintSettings['speed'];
      rotation: PrintSettings['rotation'];
      printMode: string;
    };
    includeMessageSettings: boolean;
  }): SequencedPrinterCommand[] => {
    const commands: SequencedPrinterCommand[] = [];

    // Speed, orientation, and print mode are already embedded atomically in the
    // ^NM header. Do not send a follow-up ^CM after ^NM/^SV: firmware v01.09
    // rejects it with "Save Message failed" and can wedge prompt/autocode saves.

    if (adjustSettings?.width !== undefined) commands.push({ command: `^PW ${fullAdjustSettings.width}`, delayAfterMs: 1200 });
    if (adjustSettings?.height !== undefined) commands.push({ command: `^PH ${fullAdjustSettings.height}`, delayAfterMs: 900 });
    if (adjustSettings?.delay !== undefined) commands.push({ command: `^DA ${fullAdjustSettings.delay}`, delayAfterMs: 700 });
    if (adjustSettings?.bold !== undefined) commands.push({ command: `^SB ${fullAdjustSettings.bold}`, delayAfterMs: 700 });
    if (adjustSettings?.gap !== undefined) commands.push({ command: `^GP ${fullAdjustSettings.gap}`, delayAfterMs: 700 });
    if (adjustSettings?.pitch !== undefined) commands.push({ command: `^PA ${fullAdjustSettings.pitch}`, delayAfterMs: 700 });

    return commands;
  }, []);

  const buildCounterConfigCommandSequence = useCallback((details: MessageDetails): Array<{ command: string; delayAfterMs: number }> => {
    const counters = details.advancedSettings?.counters ?? [];
    if (counters.length === 0) return [];

    const referencedCounterIds = new Set<number>();
    details.fields.forEach((field) => {
      const match = field.autoCodeFieldType?.match(/^counter_(\d+)$/i);
      const slot = match ? Number.parseInt(match[1], 10) : NaN;
      if (Number.isInteger(slot) && slot >= 1 && slot <= 4) referencedCounterIds.add(slot);
    });

    return counters
      .filter((counter) => referencedCounterIds.has(counter.id))
      .filter((counter) => {
        const defaultEnd = 999999999;
        return counter.startCount !== 0
          || counter.endCount !== defaultEnd
          || counter.incrementation !== 1
          || counter.leadingZeroes;
      })
      .map((counter) => {
        const id = Math.min(4, Math.max(1, Math.trunc(counter.id)));
        const start = Math.min(999999999, Math.max(0, Math.trunc(counter.startCount)));
        const end = Math.min(999999999, Math.max(0, Math.trunc(counter.endCount)));
        const increment = Math.min(20, Math.max(-20, Math.trunc(counter.incrementation)));
        const leadingZeroes = counter.leadingZeroes ? 1 : 0;
        // Use NAMED parameters per protocol v2.6 §5.5: ^CC C;V;S;L;T;I;E;R
        // Positional form had L/E swapped historically (firmware returned
        // InvYesNo/CmdFormat). Named form is unambiguous and confirmed working.
        return {
          command: `^CC ${id};V${start};S${start};L${leadingZeroes};I${increment};E${end}`,
          delayAfterMs: 700,
        };
      });
  }, []);

  const stripPromptMetadata = useCallback((details: MessageDetails): MessageDetails => ({
    ...details,
    fields: details.fields.map(({ promptBeforePrint, promptLabel, promptLength, ...field }) => field),
  }), []);

  const hasPrinterVisibleChanges = useCallback((next: MessageDetails, previous: MessageDetails | null): boolean => {
    if (!previous) return true;
    return JSON.stringify(stripPromptMetadata(next)) !== JSON.stringify(stripPromptMetadata(previous));
  }, [stripPromptMetadata]);



  // Merge autoCode metadata (expiryDays, fieldType, format) from a cached
  // message into a freshly-fetched one. The printer's ^LF response doesn't
  // include this metadata, so we preserve it from the locally stored version.
  const mergeAutoCodeMeta = useCallback((fetched: MessageDetails, cached: MessageDetails | null, preferCachedTemplate = false): MessageDetails => {
    if (!cached) return fetched;
    const cachedIdsAreCanonical = cached.fields.every((field, index) => field.id === index + 1);
    const fetchedIdsAreCanonical = fetched.fields.every((field, index) => field.id === index + 1);
    const allowExactIdMatch = cachedIdsAreCanonical
      && fetchedIdsAreCanonical
      && cached.fields.length === fetched.fields.length;
    const usedCachedIndexes = new Set<number>();
    // Preserve message-level local-only metadata (adjustSettings, settings, advancedSettings)
    // that the printer fetch doesn't carry
    const merged = {
      ...fetched,
      templateValue: preferCachedTemplate ? cached.templateValue ?? fetched.templateValue : fetched.templateValue,
      height: preferCachedTemplate ? cached.height ?? fetched.height : fetched.height,
      adjustSettings: fetched.adjustSettings ?? cached.adjustSettings,
      settings: fetched.settings ?? cached.settings,
      advancedSettings: fetched.advancedSettings ?? cached.advancedSettings,
      fields: fetched.fields.map((f, i) => {
      const isBlankFetchedPlaceholder = f.type === 'text' && f.data.trim().length === 0;
      const typesCompatible = (candidate: MessageDetails['fields'][number]) => (
        candidate.type === f.type
        || (['date', 'time'].includes(candidate.type) && ['date', 'time'].includes(f.type))
      );
      const blankAutoCodeCompatible = (candidate: MessageDetails['fields'][number]) => (
        isBlankFetchedPlaceholder
        && ['date', 'time'].includes(candidate.type)
        && !!candidate.autoCodeFieldType
      );
      const canMatchCandidate = (candidate: MessageDetails['fields'][number], allowBlankAutoCode = false) => (
        typesCompatible(candidate) || (allowBlankAutoCode && blankAutoCodeCompatible(candidate))
      );

      const claimCandidate = (index: number) => {
        usedCachedIndexes.add(index);
        return cached.fields[index];
      };

      let cachedField = allowExactIdMatch
        ? (() => {
            const matchIndex = cached.fields.findIndex((candidate, index) => (
              !usedCachedIndexes.has(index)
              && candidate.id === f.id
              && typesCompatible(candidate)
            ));
            return matchIndex >= 0 ? claimCandidate(matchIndex) : null;
          })()
        : null;

      // Try matching by exact data content — important for prompted fields
      // whose placeholder data (e.g. "XXX") is distinctive
      if (!cachedField) {
        const dataMatchIndex = cached.fields.findIndex((candidate, index) => (
          !usedCachedIndexes.has(index)
          && candidate.data === f.data
          && candidate.height === f.height
          && typesCompatible(candidate)
        ));
        if (dataMatchIndex >= 0) {
          cachedField = claimCandidate(dataMatchIndex);
        }
      }

      if (!cachedField) {
        const exactGeometryIndex = cached.fields.findIndex((candidate, index) => (
          !usedCachedIndexes.has(index)
          && candidate.x === f.x
          && candidate.y === f.y
          && candidate.height === f.height
          && canMatchCandidate(candidate, true)
        ));
        if (exactGeometryIndex >= 0) {
          cachedField = claimCandidate(exactGeometryIndex);
        }
      }

      if (!cachedField) {
        let bestIndex = -1;
        let bestDist = Infinity;
        for (let index = 0; index < cached.fields.length; index += 1) {
          if (usedCachedIndexes.has(index)) continue;
          const candidate = cached.fields[index];
          if (candidate.height !== f.height || !typesCompatible(candidate)) continue;
          const dist = Math.abs(candidate.x - f.x) + Math.abs(candidate.y - f.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        }
        if (bestIndex >= 0) {
          cachedField = claimCandidate(bestIndex);
        }
      }

      if (!cachedField && !usedCachedIndexes.has(i)) {
        const candidate = cached.fields[i];
        if (candidate && typesCompatible(candidate)) {
          cachedField = claimCandidate(i);
        }
      }
      if (!cachedField) return f;

      // Preserve autoCode metadata that ^LF doesn't carry
      const result = {
        ...f,
        data: isBlankFetchedPlaceholder && cachedField.autoCodeFieldType ? cachedField.data : f.data,
        autoCodeExpiryDays: f.autoCodeExpiryDays ?? cachedField.autoCodeExpiryDays,
        autoCodeFieldType: f.autoCodeFieldType ?? cachedField.autoCodeFieldType,
        autoCodeFormat: f.autoCodeFormat ?? cachedField.autoCodeFormat,
        dynamicSource: f.dynamicSource ?? cachedField.dynamicSource,
        promptBeforePrint: f.promptBeforePrint ?? cachedField.promptBeforePrint,
        promptLabel: f.promptLabel ?? cachedField.promptLabel,
        promptLength: f.promptLength ?? cachedField.promptLength,
        // promptSource ('keyboard' | 'scanner') only lives in our local cache —
        // ^LF never returns it, so always prefer the cached value when present.
        // Without this, scanner fields revert to keyboard prompts on a fresh install.
        promptSource: (f as any).promptSource ?? (cachedField as any).promptSource,
      };

      // If cached field had specific autoCode metadata but the fetched type is
      // generic ('date'/'time'), preserve the cached type so the canvas renderer
      // knows the exact sub-format (e.g. DOY vs MM/DD/YY).
      if (result.autoCodeFieldType && cachedField.type && f.type === cachedField.type) {
        // Types already match — keep fetched type
      } else if (result.autoCodeFieldType && cachedField.type === 'text' && f.type === 'date') {
        // Text field misidentified as date — restore text type
        result.type = 'text' as any;
      } else if (isBlankFetchedPlaceholder && result.autoCodeFieldType && ['date', 'time'].includes(cachedField.type)) {
        // Some firmware reports certain auto-code fields as blank text placeholders.
        // Restore the cached date/time type + metadata so live rendering still works.
        result.type = cachedField.type as any;
      }

      return result;
    })};
    return merged;
  }, []);



  const recentlySavedRef = useRef<Map<string, number>>(new Map());
  const isRecentlySavedForPrinter = useCallback((messageName: string, printerId?: number | null) => {
    const now = Date.now();
    const unscopedSavedAt = recentlySavedRef.current.get(messageName);
    const scopedSavedAt = printerId !== undefined && printerId !== null
      ? recentlySavedRef.current.get(`${printerId}:${messageName}`)
      : undefined;
    return [unscopedSavedAt, scopedSavedAt].some((savedAt) => !!savedAt && now - savedAt < 30_000);
  }, []);
  
  // Reset synced set when printer changes
  useEffect(() => {
    syncedMessagesRef.current = new Set();
    recentlySavedRef.current = new Map();
  }, [connectedPrinterId]);

  useEffect(() => {
    if (!connectionState.isConnected || !connectedPrinterId) return;
    if (syncingRef.current) return;
    
    const messagesToFetch = connectionState.messages.filter(m => {
      const name = m.name;
      // Skip if already synced this session
      if (syncedMessagesRef.current.has(name)) return false;
      // Skip read-only messages (hardcoded)
      if (isReadOnlyMessage(name)) return false;
      // NOTE: we intentionally do NOT skip when localStorage already has a
      // cached copy — on a fresh connect the printer is authoritative, and
      // local cache may be stale (e.g. user re-shaped the message via HMI,
      // or a previous TwinCode seed wrote a different field shape than what
      // the operator sees on the panel today). Always re-pull on connect.
      return true;
    });

    if (messagesToFetch.length === 0) return;

    syncingRef.current = true;
    console.log('[MessageSync] Fetching content for', messagesToFetch.length, 'messages:', messagesToFetch.map(m => m.name));

    (async () => {
      for (const msg of messagesToFetch) {
        if (!connectionState.isConnected) break;
        try {
          const details = await Promise.race([
            fetchMessageContent(msg.name),
            new Promise<null>(r => setTimeout(() => r(null), 10000)),
          ]);
          if (details && details.fields.length > 0) {
            const cached = getMessage(msg.name) ?? null;
            const merged = mergeAutoCodeMeta(details, cached, !!cached?.templateValue && isRecentlySavedForPrinter(msg.name, connectedPrinterId));
            saveMessage(merged);
            console.log('[MessageSync] Saved content for', msg.name, ':', merged.fields.length, 'fields');
          }
          syncedMessagesRef.current.add(msg.name);
        } catch (e) {
          console.error('[MessageSync] Failed to fetch', msg.name, ':', e);
          syncedMessagesRef.current.add(msg.name); // Don't retry immediately
        }
        // Delay between messages to avoid overwhelming the printer
        await new Promise(r => setTimeout(r, 500));
      }
      syncingRef.current = false;
    })();
  }, [connectionState.messages, connectionState.isConnected, connectedPrinterId, fetchMessageContent, getMessage, saveMessage]);

  const [activeMessageContent, setActiveMessageContent] = useState<MessageDetails | undefined>(undefined);

  useEffect(() => {
    const currentMessageName = connectionState.status?.currentMessage;
    const isPreviewScreen = currentScreen === 'home' || currentScreen === 'control';

    if (!currentMessageName) {
      setActiveMessageContent(undefined);
      return;
    }

    const cached = getMessage(currentMessageName) ?? undefined;

    if (!isPreviewScreen || !connectionState.isConnected || !connectedPrinterId) {
      // Not going to fetch — use cached/hardcoded version as-is
      setActiveMessageContent(cached);
      return;
    }

    // If we already have active content for this message, keep showing it
    // while the fetch runs (stale-while-revalidate). Otherwise show cached
    // only if it came from a previous fetch (has fields with non-default coords).
    // This avoids flashing hardcoded X positions that differ from ^LF results.
    setActiveMessageContent(prev => {
      if (prev && prev.name === currentMessageName) return prev; // keep current
      return cached;
    });

    // Skip re-fetching from printer if this message was recently saved from the editor.
    // The localStorage version is authoritative for 30s after a save to prevent
    // the printer's (potentially stale/filtered) version from overwriting user edits.
    if (isRecentlySavedForPrinter(currentMessageName, connectedPrinterId)) {
      console.log('[CurrentMessagePreview] skipping fetch — recently saved:', currentMessageName);
      // Use the cached (localStorage) version which has the latest metadata (e.g. autoCodeExpiryDays)
      if (cached) setActiveMessageContent(cached);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const fetched = await Promise.race([
          fetchMessageContent(currentMessageName),
          new Promise<null>(r => setTimeout(() => r(null), 10000)),
        ]);

        if (!cancelled && fetched && fetched.fields.length > 0) {
          const cached = getMessage(currentMessageName) ?? null;
          const merged = mergeAutoCodeMeta(fetched, cached, !!cached?.templateValue && isRecentlySavedForPrinter(currentMessageName, connectedPrinterId));
          saveMessage(merged);
          setActiveMessageContent(merged);
        }
      } catch (e) {
        console.error('[CurrentMessagePreview] fetch failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentScreen, connectionState.status?.currentMessage, connectionState.isConnected, connectedPrinterId, fetchMessageContent, getMessage, saveMessage]);

  const handleCountdownComplete = useCallback((printerId: number, type: CountdownType) => {
    console.log('[handleCountdownComplete] printerId:', printerId, 'type:', type);
    if (type === 'starting') {
      // The real printer firmware auto-enables HV after jet startup.
      // For the emulator, simulate this firmware behavior by enabling HV directly.
      const printer = printers.find(p => p.id === printerId);
      if (printer && multiPrinterEmulator.enabled) {
        const instance = multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port);
        if (instance) {
          console.log('[handleCountdownComplete] Emulator: auto-enabling HV for', printer.ipAddress);
          instance.processCommand('^PR 1');
        }
      }
    } else if (type === 'stopping') {
      // After the stop countdown finishes, the printer should have fully shut down.
      // Immediately set the UI state to not-ready/jet-off as a safety net.
      // The next ^SU poll (every 3s) will confirm or correct this.
      console.log('[handleCountdownComplete] Stop countdown complete for', printerId, '- setting not_ready');
      
      // Update the printer list card to show not_ready immediately
      updatePrinter(printerId, {
        status: 'not_ready',
        hasActiveErrors: false,
      });
      
      // Fire a manual ^SU to log what the printer actually reports post-shutdown
      if (connectedPrinterId === printerId) {
        sendCommand('^SU').then(result => {
          console.log('[handleCountdownComplete] Post-stop ^SU check:', result?.success, result?.response?.substring(0, 300));
        }).catch(() => {});
      }
    }
  }, [printers, sendCommand, updatePrinter, connectedPrinterId]);

  const { countdownSeconds, countdownType, startCountdown, cancelCountdown, getCountdown } = useJetCountdown(connectedPrinterId, handleCountdownComplete);

  // Master/Slave sync: auto-syncs messages and selections from master to slaves
  const { isMaster, slaveCount, syncAllMessages, syncMaster, broadcastMessage, getSlavesForMaster, sendCommandToPrinter } = useMasterSlaveSync({
    printers,
    connectedPrinterId: connectionState.connectedPrinter?.id,
    currentMessage: connectionState.status?.currentMessage,
    messages: connectionState.messages,
    getMessageContent: (messageName) => getMessage(messageName),
    buildMessageCommands,
    currentSettings: connectionState.settings,
    onSlaveSyncOutcome: (slaveId, ok, reason, messageName, verifiedMessage) => {
      // Only trust the printer's own read-back: currentMessage is set STRICTLY
      // from `verifiedMessage` (the value the slave reported when queried after
      // the ^SM write). If we didn't get a valid read-back, we do NOT touch
      // currentMessage — the old value stays, rendered as stale via the OUT OF
      // SYNC badge and the FAIL pip. Never claim a slave switched on trust.
      const patch: Partial<Printer> = {
        lastSelectionResult: {
          messageName,
          success: ok,
          reason: ok ? undefined : reason,
          at: Date.now(),
        },
      };
      if (ok && verifiedMessage) {
        patch.currentMessage = verifiedMessage;
      }
      updatePrinter(slaveId, patch);
    },
  });

  const sendVerifiedCommandSequence = useCallback(async (
    targetPrinter: Printer,
    commands: SequencedPrinterCommand[],
    delayMs = 300,
  ): Promise<{ success: boolean; failedIndex: number | null }> => {
    const commandsToRun = commands
      .map((entry) => typeof entry === 'string'
        ? { command: entry, delayAfterMs: delayMs }
        : { command: entry.command, delayAfterMs: entry.delayAfterMs ?? delayMs })
      .filter(({ command }) => command.trim().length > 0);

    if (commandsToRun.length === 0) {
      return { success: true, failedIndex: null };
    }

    // Check if emulator should handle this printer
    const emulatorHandles = multiPrinterEmulator.enabled
      && multiPrinterEmulator.isEmulatedIp(targetPrinter.ipAddress, targetPrinter.port);

    const runCommand = async (command: string) => {
      const trimmed = command.trim().toUpperCase();
      const saveOptions = (trimmed.startsWith('^NM ') || trimmed.startsWith('^NF '))
        ? { maxWaitMs: SAVE_ACK_MAX_WAIT_MS, idleAfterDataMs: SAVE_NM_IDLE_AFTER_DATA_MS }
        : trimmed === '^SV'
          ? { maxWaitMs: SAVE_ACK_MAX_WAIT_MS, idleAfterDataMs: SAVE_FLUSH_IDLE_AFTER_DATA_MS }
          : undefined;
      const validateResult = (result: { success?: boolean; response?: string; error?: string }) => {
        const response = result?.response ?? result?.error ?? '';
        const requiresSaveAck = (window.electronAPI || isRelayMode()) && (trimmed.startsWith('^NM ') || trimmed.startsWith('^NF ') || trimmed === '^SV');
        const missingSaveAck = requiresSaveAck && !hasCompleteSaveAck(response);
        const partialPendingSave = missingSaveAck && !!response.trim();
        return {
          success: !!result?.success && !isTransportCommandFailure(response) && (!missingSaveAck || partialPendingSave),
          partialPendingSave,
        };
      };

      if (targetPrinter.id === connectionState.connectedPrinter?.id) {
        const result = saveOptions && (window.electronAPI || isRelayMode())
          ? await printerTransport.sendCommand(targetPrinter.id, command, saveOptions)
          : await sendCommand(command);
        return validateResult(result);
      }

      if (emulatorHandles) {
        // Route through emulator via sendCommandToPrinter (no TCP needed)
        const success = await sendCommandToPrinter(targetPrinter, command);
        return { success };
      }

      // Real hardware: use shared session opened below
      const result = await printerTransport.sendCommand(targetPrinter.id, command, saveOptions);
      return validateResult(result);
    };

    // Only open a shared TCP session for real (non-emulated) non-connected printers
    const needsSharedSession = !emulatorHandles
      && targetPrinter.id !== connectionState.connectedPrinter?.id
      && (window.electronAPI || isRelayMode());

    return runFleetWriteExclusive(() => runPrinterWriteExclusive(targetPrinter.id, async () => {
      const hasSaveCommand = commandsToRun.some(({ command }) => isSaveSequenceCommand(command));
      let releaseSaveBusy = () => {};
    try {
      if (hasSaveCommand && needsSharedSession) {
        const saveIdle = await waitForSaveIdle(20000);
        if (!saveIdle) {
          console.warn(`[PrinterWrite] Save busy did not clear before writing ${targetPrinter.name}; aborting sequence`);
          return { success: false, failedIndex: 0 };
        }
      }

      if (hasSaveCommand) {
        releaseSaveBusy = beginSaveBusy();
      }

      if (needsSharedSession) {
        console.log(`[PrinterWrite] ${targetPrinter.name}: opening guarded session for ${commandsToRun.length} command(s)`);
        const connectResult = await printerTransport.connect({
          id: targetPrinter.id,
          ipAddress: targetPrinter.ipAddress,
          port: targetPrinter.port,
        });

        if (!connectResult?.success) {
          console.error('[PrinterWrite] Failed to connect:', connectResult?.error);
          return { success: false, failedIndex: 0 };
        }
      }

      for (let index = 0; index < commandsToRun.length; index += 1) {
        const { command, delayAfterMs } = commandsToRun[index];
        const startedAt = Date.now();
        const result = await runCommand(command);
        if (!result.success) {
          console.error(`[PrinterWrite] Command failed on ${targetPrinter.name} at #${index + 1}/${commandsToRun.length}: ${command}`);
          return { success: false, failedIndex: index };
        }
        console.log(`[PrinterWrite] ${targetPrinter.name} #${index + 1}/${commandsToRun.length} OK in ${Date.now() - startedAt}ms: ${command.trim().slice(0, 96)}`);

        const pendingAckDelay = 'partialPendingSave' in result && result.partialPendingSave ? SAVE_PENDING_ACK_EXTRA_SETTLE_MS : 0;
        const isFinalFlush = index === commandsToRun.length - 1 && command.trim().toUpperCase() === '^SV';
        if ((index < commandsToRun.length - 1 || isFinalFlush) && delayAfterMs + pendingAckDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, delayAfterMs + pendingAckDelay));
        }
      }

      return { success: true, failedIndex: null };
    } catch (error) {
      console.error('[PrinterWrite] Sequence failed:', error);
      return { success: false, failedIndex: 0 };
    } finally {
      releaseSaveBusy();
      if (needsSharedSession) {
        try {
          await printerTransport.disconnect(targetPrinter.id);
        } catch (error) {
          console.warn('[PrinterWrite] Failed to close printer session:', error);
        }
      }
    }
    }));
  }, [connectionState.connectedPrinter?.id, sendCommand, sendCommandToPrinter]);

  // syncMessageToSlaves is declared after replaceMessageWithoutDelete (below)
  // because it depends on that helper.

  const replaceMessageWithoutDelete = useCallback(async (
    targetPrinter: Printer,
    messageName: string,
    details: Pick<MessageDetails, 'fields' | 'templateValue' | 'settings' | 'adjustSettings' | 'advancedSettings'>,
    reselectAfter: boolean = true,
  ) => {
    const { perMessageSettings } = buildEffectiveMessageDependentSettings(details as MessageDetails);
    const rawCommands = await buildMessageCommands(
      messageName,
      details.fields,
      details.templateValue,
      false,
      perMessageSettings,
      details.advancedSettings?.counters,
    );

    if (!rawCommands || rawCommands.length === 0) {
      return { success: true as const, reason: null as 'switch' | 'command' | 'reselect' | null };
    }

    // Fast path: ^NM on an existing message updates fields in place without
    // needing ^DM. We only needed delete-recreate when the template height
    // changed (firmware preserves the old template on a plain ^NM update).
    // Since the editor now constrains templates to the printer's capabilities
    // and the master's template matches what the slave already has, skip the
    // ^DM entirely — and skip the parking ^SM (which was only needed because
    // ^DM is rejected on the active message). This shaves ~3s per slave sync.
    //
    // NOTE: If a future change ever needs to alter template height on a
    // slave, restore the park → delete → recreate flow in this branch.
    const commands = rawCommands.filter((cmd) => {
      const upper = cmd.trim().toUpperCase();
      return upper !== '^SV' && !upper.startsWith('^DM ');
    });

    const sequence: string[] = [];
    // Counter formatting (digits + leading zeros) is now baked into each ^AC
    // field by buildMessageCommands per protocol v2.6 §5.33 — no separate
    // ^CC slot config command needed (and the firmware does not accept one).
    sequence.push(...commands);
    sequence.push('^SV');
    // Only re-select the message if the caller asks for it. In bulk "Sync
    // Slaves" we push many messages back-to-back; issuing ^SM after each
    // would make the slave visibly cycle through every message and land on
    // whichever one was pushed last instead of keeping the master's active
    // message selected. A ^SM reselect is only needed when the slave already
    // had this exact message active (so the firmware re-renders the fields).
    const reselectCommandIndex = reselectAfter ? sequence.length : -1;
    if (reselectAfter) {
      sequence.push(`^SM ${messageName}`);
    }

    const sequencedCommands = sequence.map((command) => ({
      command,
      delayAfterMs: getSaveCommandDelay(command, details.fields.length),
    }));

    const result = await sendVerifiedCommandSequence(targetPrinter, sequencedCommands, 300);
    if (!result.success) {
      if (reselectAfter && result.failedIndex === reselectCommandIndex) {
        return { success: false as const, reason: 'reselect' as const };
      }
      return { success: false as const, reason: 'command' as const };
    }

    return { success: true as const, reason: null as 'switch' | 'command' | 'reselect' | null };
  }, [buildCounterConfigCommandSequence, buildEffectiveMessageDependentSettings, buildMessageCommands, sendVerifiedCommandSequence]);

  // After saving a message on the master, duplicate the full content to all
  // slaves. If the message is currently SELECTED on a slave with a different
  // template, ^DM is rejected and the slave keeps its old template (causing
  // overlapping lines). replaceMessageWithoutDelete handles deselect → rewrite
  // → reselect so the master's template (encoded in ^NM) takes effect.
  const syncMessageToSlaves = useCallback(async (
    messageName: string,
    details: MessageDetails,
    isNew?: boolean,
  ): Promise<Array<{ slaveId: number; slaveName: string; ok: boolean; reason?: string }>> => {
    if (!isMaster || !connectionState.connectedPrinter) return [];
    if (isPresetMessage(messageName)) {
      console.log(`[MasterSlaveSync] Skipping preset message "${messageName}" — already exists on slaves`);
      return [];
    }
    const slaves = getSlavesForMaster(connectionState.connectedPrinter.id);
    if (slaves.length === 0) return [];

    if (details.fields.length === 0) return [];

    // Offline slaves cannot receive the push — flag them as OUT OF SYNC
    // (via the returned failure entry) instead of silently skipping.
    const results: Array<{ slaveId: number; slaveName: string; ok: boolean; reason?: string }> = [];
    const availableSlaves: typeof slaves = [];
    for (const s of slaves) {
      if (!s.isAvailable) {
        results.push({ slaveId: s.id, slaveName: s.name, ok: false, reason: 'offline' });
      } else {
        availableSlaves.push(s);
      }
    }

    console.log(`[MasterSlaveSync] Pushing "${messageName}" to ${availableSlaves.length} slave(s) (${results.length} offline flagged, template=${details.templateValue ?? '32'})`);

    const targetUpper = messageName.trim().toUpperCase();
    for (const slave of availableSlaves) {
      const slaveCurrent = slave.currentMessage?.trim().toUpperCase();
      let ok = false;
      // Per-printer rotation override: always force the printer card setting
      // into the message header so message-stored rotation is ignored.
      const slaveRotation = slave.rotation ?? 'Normal';
      const slaveAdjust = { ...(details.adjustSettings ?? {}), rotation: slaveRotation };
      // Per-printer expiry offset override: apply slave.expiryOffsetDays to
      // any expiry date field so each line uses its own offset.
      const slaveOffset = slave.expiryOffsetDays;
      const slaveFields = slaveOffset === undefined
        ? details.fields
        : details.fields.map((f) => {
            const isExpiry = f.autoCodeFieldType?.startsWith('date_expiry')
              || (f.autoCodeExpiryDays ?? 0) > 0;
            return isExpiry ? { ...f, autoCodeExpiryDays: slaveOffset } : f;
          });
      const result = await replaceMessageWithoutDelete(slave, messageName, {
        fields: slaveFields,
        templateValue: details.templateValue,
        settings: details.settings,
        adjustSettings: slaveAdjust,
        advancedSettings: details.advancedSettings,
      }, slaveCurrent === targetUpper);
      ok = result.success;
      const reason = ok ? undefined : (result.reason ?? 'unknown');
      results.push({ slaveId: slave.id, slaveName: slave.name, ok, reason });
      if (!ok) {
        console.warn(`[MasterSlaveSync] Slave rewrite failed on ${slave.name}: ${reason}`);
      }

      if (ok) {
        const slaveDetails = normalizeMessageForPrinter({ ...details, name: messageName, fields: slaveFields, adjustSettings: slaveAdjust });
        saveMessage(slaveDetails, slave.id);
        recentlySavedRef.current.set(`${slave.id}:${messageName}`, Date.now());
        if (slaveCurrent === targetUpper) {
          updatePrinter(slave.id, { currentMessage: messageName });
        }
      }
      console.log(`[MasterSlaveSync] Pushed "${messageName}" → ${slave.name}: ${ok ? 'OK' : 'PARTIAL'}`);
    }
    return results;
  }, [isMaster, connectionState.connectedPrinter, getSlavesForMaster, replaceMessageWithoutDelete, normalizeMessageForPrinter, saveMessage, updatePrinter]);

  const saveEditedMessage = useCallback(async (details: MessageDetails, isNew?: boolean): Promise<MessageDetails | null> => {
    if (!editingMessage) return null;


    const targetName = isNew ? details.name : editingMessage.name;
    const localDetails = normalizeMessageForPrinter({
      ...details,
      name: targetName,
    });
    const cachedDetails = getMessage(editingMessage.name) ?? getMessage(targetName) ?? null;
    const printerWriteNeeded = isNew || hasPrinterVisibleChanges(localDetails, cachedDetails);
    const { fullAdjustSettings, perMessageSettings } = buildEffectiveMessageDependentSettings(localDetails);
    const hasMessagePrinterSettings = !!(
      localDetails.settings
      || localDetails.adjustSettings?.speed !== undefined
      || localDetails.adjustSettings?.rotation !== undefined
    );
    const hasAdjustSettings = !!localDetails.adjustSettings;
    const hasExtendedDateFields = localDetails.fields.some((field) => {
      const fieldType = field.autoCodeFieldType ?? '';
      return fieldType.startsWith('date_expiry')
        || fieldType.startsWith('date_rollover')
        || fieldType.startsWith('date_expiry_rollover');
    });
    // Per mem://features/message-persistence/dozen12-validation:
    // NO scaled timeout math based on field count, NO settleBefore/After delays,
    // NO waitForPollingIdle around the save handoff. The ^NM digest pause inside
    // saveMessageContent already gives the firmware its size-scaled headroom; the
    // HMI confirms saves complete in <1s, so anything more on this side just
    // re-enters mid-grace and wedges the printer.
    const fieldCount = localDetails.fields.length;
    const followUpSettleMs = MESSAGE_RELOAD_SETTLE_MS;
    const reloadSettleMs = MESSAGE_RELOAD_SETTLE_MS;
    // Heavy messages (≥6 fields) and extended-date messages skip the post-save
    // ^GM/^LF reload — the local merged copy is already authoritative and the
    // reload was the step that historically raced with firmware grace windows.
    const shouldReloadFromPrinter = !hasExtendedDateFields && fieldCount < 6;

    console.log('[AdjustDebug][saveEditedMessage.start]', {
      editingMessageName: editingMessage.name,
      targetName,
      isNew: !!isNew,
      connectedPrinterId: connectionState.connectedPrinter?.id ?? null,
      incomingAdjustSettings: details.adjustSettings ?? null,
      normalizedAdjustSettings: localDetails.adjustSettings ?? null,
      cachedAdjustSettings: cachedDetails?.adjustSettings ?? null,
      printerWriteNeeded,
      hasExtendedDateFields,
      fieldCount,
      followUpSettleMs,
      reloadSettleMs,
    });

    if (!printerWriteNeeded) {
      updateMessage(editingMessage.id, details.name);
      saveMessage(localDetails);
      recentlySavedRef.current.set(targetName, Date.now());
      syncedMessagesRef.current.add(targetName);
      console.log('[onSave] Prompt metadata changed locally; skipping printer rewrite');
      return localDetails;
    }

    const success = await saveMessageContent(
      targetName,
      localDetails.fields,
      localDetails.templateValue,
      isNew,
      perMessageSettings,
      localDetails.advancedSettings?.counters,
    );
    if (!success) {
      const reason = (saveMessageContent as any).__lastError || '';
      console.error('Failed to save message on printer:', reason);
      toast.error(`Printer rejected message save: ${reason || 'Check settings and try again.'}`);
      return null;
    }

    const currentlySelectedName = connectionState.status?.currentMessage?.trim().toUpperCase();
    const normalizedTargetName = targetName.trim().toUpperCase();
    const restorePreviousSelection = !!(
      currentlySelectedName
      && currentlySelectedName !== normalizedTargetName
    );

    const messageDependentCommands = buildMessageDependentCommandSequence({
      adjustSettings: localDetails.adjustSettings,
      fullAdjustSettings,
      perMessageSettings,
      includeMessageSettings: hasMessagePrinterSettings,
    });
    // Counter formatting is now embedded in each ^AC field by saveMessageContent
    // (protocol v2.6 §5.33), so no separate post-save counter-config sequence
    // is needed here.

    let restoredByCommandSequence = false;
    if (messageDependentCommands.length > 0 && connectionState.connectedPrinter) {
      const commandSequence: SequencedPrinterCommand[] = [];

      // ^NM already leaves the just-saved message selected on the printer,
      // so avoid sending an immediate redundant ^SM on heavy saves.
      commandSequence.push(...messageDependentCommands);

      if (hasAdjustSettings || hasMessagePrinterSettings) {
        commandSequence.push('^SV');
      }

      if (restorePreviousSelection && currentlySelectedName) {
        commandSequence.push({
          command: `^SM ${currentlySelectedName}`,
          delayAfterMs: reloadSettleMs,
        });
      }

      setPollingPaused(true);
      try {
        // No pre-sequence sleep / waitForPollingIdle: forbidden by
        // mem://features/message-persistence/dozen12-validation. saveMessageContent
        // already paused polling and added the ^NM digest pause; the firmware is
        // ready for the settings sequence as soon as ^NM/^SV ack returns.
        const result = await sendVerifiedCommandSequence(connectionState.connectedPrinter, commandSequence, followUpSettleMs);
        if (!result.success) {
          toast.error(`Saved "${targetName}", but failed to apply the message settings on the printer.`);
        } else if (hasAdjustSettings) {
          updateSettings(fullAdjustSettings);
        }
      } finally {
        setPollingPaused(false);
      }
      // The command sequence already handled restoring the previous selection,
      // so skip the duplicate restore below.
      restoredByCommandSequence = true;
    }

    if (!isNew) {
      updateMessage(editingMessage.id, details.name);
    }
    saveMessage(localDetails);
    recentlySavedRef.current.set(targetName, Date.now());
    syncedMessagesRef.current.add(targetName);
    syncMessageToSlaves(targetName, localDetails, isNew);

    if (shouldReloadFromPrinter && connectionState.isConnected) {
      try {
        // No 500ms sleep + waitForPollingIdle here — forbidden by
        // mem://features/message-persistence/dozen12-validation. The reload is
        // best-effort and races nothing critical (5s Promise.race protects us).

        const refreshed = await Promise.race([
          fetchMessageContent(targetName),
          new Promise<null>(r => setTimeout(() => r(null), 5000)),
        ]);
        if (refreshed && refreshed.fields.length > 0) {
          const merged = mergeAutoCodeMeta(refreshed, localDetails, !!localDetails.templateValue);
          console.log('[AdjustDebug][saveEditedMessage.refreshed]', {
            targetName,
            refreshedAdjustSettings: refreshed.adjustSettings ?? null,
            localAdjustSettings: localDetails.adjustSettings ?? null,
            mergedAdjustSettings: merged.adjustSettings ?? null,
          });
          saveMessage(merged);
          // Only restore previous selection if the command sequence didn't already do it
          if (isNew && !restoredByCommandSequence) {
            const prevMessage = connectionState.status?.currentMessage;
            if (prevMessage && prevMessage !== targetName) {
              try {
                await sendCommand(`^SM ${prevMessage}`);
              } catch (e) {
                console.error('[onSave] Failed to re-select previous message:', e);
              }
            }
          }
          return merged;
        }
      } catch (e) {
        console.error('[onSave] post-save reload failed:', e);
      }
    } else if (hasExtendedDateFields) {
      console.log('[onSave] Skipping immediate post-save ^GM/^LF reload for extended date fields');
    }

    if (isNew && connectionState.isConnected && !restoredByCommandSequence) {
      const prevMessage = connectionState.status?.currentMessage;
      if (prevMessage && prevMessage !== targetName) {
        try {
          await sendCommand(`^SM ${prevMessage}`);
        } catch (e) {
          console.error('[onSave] Failed to re-select previous message:', e);
        }
      }
    }

    return localDetails;
  }, [
    buildEffectiveMessageDependentSettings,
    buildMessageDependentCommandSequence,
    buildCounterConfigCommandSequence,
    editingMessage,
    normalizeMessageForPrinter,
    getMessage,
    hasPrinterVisibleChanges,
    connectionState.connectedPrinter?.id,
    updateMessage,
    updateSettings,
    saveMessage,
    saveMessageContent,
    syncMessageToSlaves,
    connectionState.isConnected,
    connectionState.connectedPrinter,
    connectionState.status?.currentMessage,
    fetchMessageContent,
    mergeAutoCodeMeta,
    sendVerifiedCommandSequence,
    sendCommand,
  ]);

  const clearAllExpiryOverrides = useCallback(() => {
    printers.forEach((printer) => {
      if (printer.expiryOffsetDays !== undefined) {
        updatePrinter(printer.id, { expiryOffsetDays: undefined });
      }
    });
  }, [printers, updatePrinter]);

  const getStoredMessageForPrinter = useCallback((messageName: string, targetPrinter?: Printer | null): MessageDetails | null => {
    const candidatePrinterIds = [
      ...(targetPrinter?.role === 'slave' && targetPrinter.masterId !== undefined ? [targetPrinter.masterId] : []),
      ...(targetPrinter?.id !== undefined ? [targetPrinter.id] : []),
      ...(targetPrinter?.role !== 'slave' && targetPrinter?.masterId !== undefined ? [targetPrinter.masterId] : []),
      ...(connectionState.connectedPrinter?.id !== undefined ? [connectionState.connectedPrinter.id] : []),
    ];

    const seen = new Set<number>();
    for (const printerId of candidatePrinterIds) {
      if (seen.has(printerId)) continue;
      seen.add(printerId);

      const stored = getMessage(messageName, printerId);
      if (stored) return stored;
    }

    return getMessage(messageName);
  }, [connectionState.connectedPrinter?.id, getMessage]);

  /** Push a PC Library message to the printer by replacing the swap slot */
  const pushPcLibraryToPrinter = useCallback(async (
    libraryMessage: MessageDetails,
    swapSlotNameArg: string | null,
    targetPrinter?: Printer | null,
  ): Promise<boolean> => {
    const printer = targetPrinter ?? connectionState.connectedPrinter;
    if (!printer || !connectionState.isConnected) {
      toast.error('No printer connected');
      return false;
    }

    // Validate template compatibility with target printer model
    const model = connectionState.status?.printerModel;
    const variant = connectionState.status?.printerVariant;
    const capabilities = getModelCapabilities(model, variant);
    if (capabilities && libraryMessage.templateValue) {
      const templateId = libraryMessage.templateValue as import('@/lib/modelCapabilities').TemplateId;
      if (!capabilities.templates.includes(templateId)) {
        const maxTemplate = capabilities.templates[0]; // First entry is the largest
        toast.error(`This message uses a ${libraryMessage.templateValue}-dot template which is not supported by this ${model ? 'Model ' + model : 'printer'} (max ${maxTemplate}-dot)`);
        return false;
      }
    }

    try {
      // First, save the current swap slot to PC Library if it exists on the printer
      if (swapSlotNameArg) {
        const swapDetails = getStoredMessageForPrinter(swapSlotNameArg, printer);
        if (swapDetails) {
          saveToPcLibrary(swapDetails, printer.id);
        }
      }

      // Create the library message on the printer (saveMessageContent handles ^DM + ^NM + ^SV)
      const ok = await saveMessageContent(
        libraryMessage.name,
        libraryMessage.fields,
        libraryMessage.templateValue,
        true, // isNew — create fresh
        libraryMessage.settings ? {
          speed: libraryMessage.settings.speed,
          rotation: libraryMessage.settings.rotation,
          printMode: libraryMessage.settings.printMode,
        } : undefined,
        libraryMessage.advancedSettings?.counters,
      );

      if (!ok) {
        toast.error('Failed to push message to printer');
        return false;
      }

      // Save to regular storage too
      saveMessage(libraryMessage, printer.id);

      // Remove from PC Library since it's now on the printer
      deleteFromPcLibrary(libraryMessage.name, printer.id);

      // Update swap slot to the new message name
      setSwapSlot(libraryMessage.name, printer.id);

      return true;
    } catch (e) {
      console.error('[PcLibrary] Failed to push message:', e);
      return false;
    }
  }, [connectionState.connectedPrinter, connectionState.isConnected, saveMessageContent, getStoredMessageForPrinter, saveToPcLibrary, saveMessage, deleteFromPcLibrary, setSwapSlot]);

  /** Save a printer message to the PC Library */
  const handleSaveToPcLibrary = useCallback(async (message: PrintMessage, targetPrinter?: Printer | null) => {
    const printer = targetPrinter ?? connectionState.connectedPrinter;
    if (!printer) return;

    // Get the full message details from storage or fetch from printer
    let details = getStoredMessageForPrinter(message.name, printer);
    if (!details && connectionState.isConnected) {
      try {
        details = await fetchMessageContent(message.name);
      } catch {}
    }

    if (!details) {
      toast.error('Could not read message details — connect to the printer first');
      return;
    }

    saveToPcLibrary(details, printer.id);
    toast.success(`"${message.name}" saved to PC Library`);
  }, [connectionState.connectedPrinter, connectionState.isConnected, getStoredMessageForPrinter, saveToPcLibrary, fetchMessageContent]);

  const applyStoredAdjustSettings = useCallback(async (
    targetPrinter: Printer,
    messageName: string,
  ): Promise<void> => {
    const stored = getStoredMessageForPrinter(messageName, targetPrinter);
    const hasStoredAdjustSettings = !!stored?.adjustSettings;
    const hasStoredMessageSettings = !!stored?.settings;

    if (!hasStoredAdjustSettings && !hasStoredMessageSettings) {
      console.warn('[AdjustDebug][applyStoredAdjustSettings.skip]', {
        targetPrinterId: targetPrinter.id,
        targetPrinterName: targetPrinter.name,
        messageName,
        storedFound: !!stored,
        storedAdjustSettings: stored?.adjustSettings ?? null,
        storedMessageSettings: stored?.settings ?? null,
      });
      return;
    }

    const adj = stored.adjustSettings ?? {};
    const { fullAdjustSettings, perMessageSettings } = buildEffectiveMessageDependentSettings(stored);
    const commands = buildMessageDependentCommandSequence({
      adjustSettings: adj,
      fullAdjustSettings,
      perMessageSettings,
      includeMessageSettings: hasStoredMessageSettings,
    });

    console.log('[AdjustDebug][applyStoredAdjustSettings.start]', {
      targetPrinterId: targetPrinter.id,
      targetPrinterName: targetPrinter.name,
      messageName,
      currentConnectionSettings: connectionState.settings,
      storedAdjustSettings: adj,
      storedMessageSettings: stored.settings ?? null,
      computedFullSettings: fullAdjustSettings,
      computedPerMessageSettings: perMessageSettings,
      commands,
    });

    if (targetPrinter.id === connectionState.connectedPrinter?.id) {
      setPollingPaused(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await waitForPollingIdle(3000);
        const result = await sendVerifiedCommandSequence(targetPrinter, commands, 300);
        if (!result.success) {
          console.error('[AdjustDebug][applyStoredAdjustSettings.failed]', {
            targetPrinterId: targetPrinter.id,
            messageName,
            result,
          });
          // Silent failure — Adjust re-apply is best-effort; print itself already succeeded
          return;
        }
      } finally {
        setPollingPaused(false);
      }
    } else {
      const result = await sendVerifiedCommandSequence(targetPrinter, commands, 300);
      if (!result.success) {
        console.error('[AdjustDebug][applyStoredAdjustSettings.failed]', {
          targetPrinterId: targetPrinter.id,
          messageName,
          result,
        });
        // Silent failure — Adjust re-apply is best-effort
        return;
      }
    }

    console.log('[AdjustDebug][applyStoredAdjustSettings.success]', {
      targetPrinterId: targetPrinter.id,
      messageName,
      appliedSettings: fullAdjustSettings,
      appliedPerMessageSettings: perMessageSettings,
    });

    updateSettings(fullAdjustSettings);
  }, [
    buildEffectiveMessageDependentSettings,
    buildMessageDependentCommandSequence,
    getStoredMessageForPrinter,
    connectionState.settings,
    connectionState.connectedPrinter?.id,
    sendVerifiedCommandSequence,
    updateSettings,
  ]);

  const applyPromptValuesToPrinter = useCallback(async (
    targetPrinter: Printer | null,
    message: PrintMessage,
    updatedDetails: MessageDetails,
  ): Promise<boolean> => {
    if (!targetPrinter) return false;

    // Resolve any {TOKEN} placeholders (linked fields, QR codes referencing
    // scanned values or counters) so the printer only ever receives baked data.
    const tokenMap = buildTokenMap(updatedDetails);
    const resolvedDetails: MessageDetails = {
      ...updatedDetails,
      fields: resolveAllFields(updatedDetails.fields, tokenMap),
    };

    const isConnected = targetPrinter.id === connectionState.connectedPrinter?.id;

    // Use the same full-rewrite approach that works for date offset changes:
    // switch away from active message → send ^NM with all field data (including
    // entered values) → reselect. ^MD^TD is unreliable on this firmware.
    console.log(`[PromptWrite] Using replaceMessageWithoutDelete for "${message.name}" on ${targetPrinter.name}`);

    // Helper: also push the resolved (baked) values to all slaves of this master.
    const pushToSlaves = async () => {
      if (targetPrinter.role !== 'master') return;
      const slaves = getSlavesForMaster(targetPrinter.id).filter(s => s.isAvailable);
      if (slaves.length === 0) return;
      console.log(`[PromptWrite] Pushing baked prompt values to ${slaves.length} slave(s)`);
      for (const slave of slaves) {
        try {
          const r = await replaceMessageWithoutDelete(slave, message.name, {
            fields: resolvedDetails.fields,
            templateValue: resolvedDetails.templateValue,
          });
          if (!r.success) {
            console.warn(`[PromptWrite] Slave ${slave.name} rewrite failed: ${r.reason}`);
            continue;
          }
          updatePrinter(slave.id, { currentMessage: message.name });
        } catch (e) {
          console.error(`[PromptWrite] Slave ${slave.name} push error:`, e);
        }
      }
    };

    if (isConnected) {
      setPollingPaused(true);
      try {
        const pollingIdle = await waitForPollingIdle();
        if (!pollingIdle) {
          console.warn('[PromptWrite] Connected printer is still busy');
          return false;
        }

        const result = await replaceMessageWithoutDelete(targetPrinter, message.name, {
          fields: resolvedDetails.fields,
          templateValue: resolvedDetails.templateValue,
        });

        if (!result.success) {
          console.error(`[PromptWrite] replaceMessageWithoutDelete failed: ${result.reason}`);
          return false;
        }

        const selected = await selectMessage(message);
        if (selected) {
          clearAllExpiryOverrides();
        }
        await pushToSlaves();
        return selected;
      } finally {
        setPollingPaused(false);
      }
    }

    // Non-connected printer: same full rewrite approach
    const result = await replaceMessageWithoutDelete(targetPrinter, message.name, {
      fields: resolvedDetails.fields,
      templateValue: resolvedDetails.templateValue,
    });

    if (!result.success) {
      console.error(`[PromptWrite] replaceMessageWithoutDelete failed on non-connected: ${result.reason}`);
      return false;
    }

    const ok = await sendCommandToPrinter(targetPrinter, `^SM ${message.name}`);
    if (ok) {
      updatePrinter(targetPrinter.id, { currentMessage: message.name });
      clearAllExpiryOverrides();
    }
    await pushToSlaves();
    return ok;
  }, [clearAllExpiryOverrides, connectionState.connectedPrinter?.id, getSlavesForMaster, replaceMessageWithoutDelete, selectMessage, sendCommandToPrinter, updatePrinter]);

  // Per-printer expiry offset change — uses switch-away flow to rewrite ^NM with new ^AE offset
  const handleExpiryOffsetChange = useCallback(async (printerId: number, newDays: number) => {
    const targetPrinter = printers.find(p => p.id === printerId);
    if (!targetPrinter || !targetPrinter.isAvailable) {
      toast.error('Printer is offline');
      return;
    }

    // Determine which message is active on this printer
    // ALWAYS use the slave's own currentMessage — the master may be sitting on a
    // different message (e.g. master=DOZEN12, slave=BESTCODE). Using the master's
    // name caused the slave's switch-away ^SM to target a message it wasn't on,
    // and broke the preview by loading a phantom message under the slave card.
    const messageName = targetPrinter.currentMessage;
    const syncedMasterMessage = targetPrinter.role === 'slave' && targetPrinter.masterId !== undefined
      ? printers.find(p => p.id === targetPrinter.masterId)?.currentMessage
      : undefined;
    if (!messageName) {
      toast.error('No active message on this printer');
      return;
    }

    // Get cached message content
    const stored = (targetPrinter.role === 'slave' && targetPrinter.masterId !== undefined
      ? (getMessage(messageName, targetPrinter.masterId) || getMessage(messageName, targetPrinter.id))
      : getMessage(messageName, targetPrinter.id))
      || (targetPrinter.masterId !== undefined ? getMessage(messageName, targetPrinter.masterId) : null)
      || (connectionState.connectedPrinter?.id !== undefined ? getMessage(messageName, connectionState.connectedPrinter.id) : null)
      || getMessage(messageName);
    if (!stored || stored.fields.length === 0) {
      toast.error(`No cached content for "${messageName}"`);
      return;
    }

    console.log(`[ExpiryOffset] Changing offset on ${targetPrinter.name} for "${messageName}": ${targetPrinter.expiryOffsetDays ?? 0} → ${newDays} days`);

    // Pause polling to prevent TCP conflicts on the target printer's port 23
    setPollingPaused(true);
    try {
      const pollingIdle = await waitForPollingIdle(3000);
      if (!pollingIdle) {
        console.warn(`[ExpiryOffset] Polling still active, proceeding anyway`);
      }

      // Clone fields with modified autoCodeExpiryDays on expiry date fields ONLY
      const modifiedFields = stored.fields.map(field => {
        const isExpiryDateField = field.type === 'date' && (
          field.autoCodeFieldType?.startsWith('date_expiry')
          || (field.autoCodeExpiryDays ?? 0) > 0
        );
        if (isExpiryDateField) {
          return { ...field, autoCodeExpiryDays: newDays };
        }
        return field;
      });

      const modifiedDetails: Pick<MessageDetails, 'fields' | 'templateValue'> = {
        fields: modifiedFields,
        templateValue: stored.templateValue,
      };

      // Use replaceMessageWithoutDelete for the switch-away flow
      // This handles: ^SM BESTCODE → ^NM (with new offset, no ^SV) → ^SM back
      const rewriteTarget = syncedMasterMessage
        ? { ...targetPrinter, currentMessage: messageName }
        : targetPrinter;
      const result = await replaceMessageWithoutDelete(rewriteTarget, messageName, modifiedDetails);

      if (!result.success) {
        console.error(`[ExpiryOffset] Failed on ${targetPrinter.name}: ${result.reason}`);
        toast.error(`Expiry update failed on ${targetPrinter.name}: ${result.reason}`);
        return;
      }

      // Re-apply cached User Define (prompted field) value if any
      const promptFieldIdx = stored.fields.findIndex(f => f.promptBeforePrint);
      if (promptFieldIdx >= 0) {
        const promptField = stored.fields[promptFieldIdx];
        const tdNum = promptFieldIdx + 1; // 1-indexed
        const cachedValue = promptField.data?.trim();
        if (cachedValue) {
          console.log(`[ExpiryOffset] Re-applying ^MD^TD${tdNum} "${cachedValue}" on ${targetPrinter.name}`);
          await sendCommandToPrinter(targetPrinter, `^MD^TD${tdNum};${cachedValue}`);
        }
      }

      // NOTE: Do NOT update the shared message cache here — the original message
      // definition should stay unchanged so other printers keep their original expiry.
      // The per-printer override lives in printer.expiryOffsetDays only.

      // Update printer state
      updatePrinter(printerId, { expiryOffsetDays: newDays });
      toast.success(`${targetPrinter.name}: expiry offset → ${newDays} day${newDays !== 1 ? 's' : ''}`);
      console.log(`[ExpiryOffset] Complete on ${targetPrinter.name}`);
    } finally {
      // Resume polling after a short grace period
      setTimeout(() => setPollingPaused(false), 1000);
    }
  }, [printers, getMessage, saveMessage, replaceMessageWithoutDelete, sendCommandToPrinter, updatePrinter, connectionState.connectedPrinter?.id]);

  // Delay alerts on startup so update notification can appear first
  const [lowStockAlertQueue, setLowStockAlertQueue] = useState<LowStockAlertData[]>([]);

  // Persist alerted keys in sessionStorage so they survive React remounts / page
  // navigations but reset on a fresh app launch (closing Electron & reopening).
  const alertedConsumablesRef = useRef<Set<string>>(
    (() => {
      try {
        const stored = sessionStorage.getItem('__cs_alerted_consumables');
        return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
      } catch { return new Set<string>(); }
    })()
  );
  // Keep ref → sessionStorage in sync
  const persistAlerted = (set: Set<string>) => {
    try { sessionStorage.setItem('__cs_alerted_consumables', JSON.stringify([...set])); } catch {}
  };

  // Track previous ink/makeup levels per printer — persisted to localStorage so
  // they survive app restarts. Stock is only deducted when a level transitions
  // FROM low/empty BACK TO full/good, proving a physical bottle was replaced.
  const PREV_LEVELS_KEY = 'codesync-prev-fluid-levels';
  const prevLevelsRef = useRef<Record<number, { ink?: string; makeup?: string }>>(
    (() => {
      try {
        const stored = localStorage.getItem(PREV_LEVELS_KEY);
        return stored ? JSON.parse(stored) : {};
      } catch { return {}; }
    })()
  );
  const persistPrevLevels = (data: Record<number, { ink?: string; makeup?: string }>) => {
    try { localStorage.setItem(PREV_LEVELS_KEY, JSON.stringify(data)); } catch {}
  };

  useEffect(() => {
    printers.forEach(printer => {
      if (!printer.isAvailable) return;
      const linked = consumableStorage.getConsumablesForPrinter(printer.id);

      const prev = prevLevelsRef.current[printer.id];

      // Seed baseline on first observation for this printer.
      if (!prev) {
        prevLevelsRef.current[printer.id] = {
          ink: printer.inkLevel,
          makeup: printer.makeupLevel,
        };
        persistPrevLevels(prevLevelsRef.current);
        return;
      }

      // Deduct stock when level goes from LOW/EMPTY → FULL/GOOD (bottle replaced).
      const checkBottleReplaced = (level: string | undefined, prevLevel: string | undefined, consumable: ReturnType<typeof consumableStorage.getConsumablesForPrinter>['ink'], label: 'Ink' | 'Makeup') => {
        if (!consumable || !level || !prevLevel) return;

        const wasLow = prevLevel === 'LOW' || prevLevel === 'EMPTY';
        const isNowFull = level === 'FULL' || level === 'GOOD';

        // A bottle was physically added — transition from low/empty to full/good
        if (wasLow && isNowFull) {
          if (consumable.currentStock > 0) {
            consumableStorage.adjustStock(consumable.id, -1);
            logConsumption({
              consumableId: consumable.id,
              printerId: printer.id,
              type: label === 'Ink' ? 'ink' : 'makeup',
              qty: 1,
            });
          }

          // Check if we should alert about low stock after deduction
          const updatedStock = consumable.currentStock > 0 ? consumable.currentStock - 1 : 0;
          if (updatedStock <= consumable.minimumStock) {
            const alertKey = `${printer.id}-${consumable.id}-refill`;
            if (!alertedConsumablesRef.current.has(alertKey)) {
              alertedConsumablesRef.current.add(alertKey);
              persistAlerted(alertedConsumablesRef.current);
              setLowStockAlertQueue(q => [...q, {
                printerName: printer.name,
                label,
                level: 'LOW',
                consumable: { ...consumable, currentStock: updatedStock },
                deducted: true,
              }]);
            }
          }
        }
      };

      checkBottleReplaced(printer.inkLevel, prev.ink, linked.ink, 'Ink');
      checkBottleReplaced(printer.makeupLevel, prev.makeup, linked.makeup, 'Makeup');

      // Update previous levels after processing
      prevLevelsRef.current[printer.id] = {
        ink: printer.inkLevel,
        makeup: printer.makeupLevel,
      };
      persistPrevLevels(prevLevelsRef.current);
    });
    // Depend only on the specific stable fields — not the whole consumableStorage
    // object (which is a new reference every render and would cause an infinite
    // setState loop via adjustStock → re-render → effect re-fires).
  }, [printers, consumableStorage.consumables, consumableStorage.assignments, consumableStorage.adjustStock]);

  // Drop stale queued alerts after manual stock replenishment and keep card stock in sync.
  useEffect(() => {
    setLowStockAlertQueue(prev => prev
      .map((alert) => {
        const live = consumableStorage.getConsumable(alert.consumable.id);
        if (!live) return null;
        if (live.currentStock > live.minimumStock) return null;
        return {
          ...alert,
          consumable: {
            ...live,
            currentStock: live.currentStock,
          },
        };
      })
      .filter((alert): alert is LowStockAlertData => alert !== null)
    );
  }, [consumableStorage.consumables, consumableStorage.getConsumable]);

  // Auto-downtime detection: track jet/HV state transitions for active production runs
  const prevPrinterStateRef = useRef<{ jetRunning: boolean; isRunning: boolean }>({ jetRunning: false, isRunning: false });
  useEffect(() => {
    const jetRunning = connectionState.status?.jetRunning ?? false;
    const isRunning = connectionState.status?.isRunning ?? false;
    const prev = prevPrinterStateRef.current;
    const printerId = connectionState.connectedPrinter?.id;

    if (printerId != null) {
      const activeRuns = productionStorage.runs.filter(
        r => r.printerId === printerId && r.endTime === null
      );

      for (const run of activeRuns) {
        const hasActiveDowntime = run.downtimeEvents.some(e => e.endTime === null);

        // Jet stopped or HV went off → start downtime
        if ((prev.jetRunning && !jetRunning) || (prev.isRunning && !isRunning)) {
          if (!hasActiveDowntime) {
            const reason = !jetRunning ? 'jet_stopped' : 'hv_disabled';
            productionStorage.addDowntimeEvent(run.id, reason);
          }
        }

        // Jet restarted and HV back on → end downtime
        if (jetRunning && isRunning && hasActiveDowntime) {
          const activeEvt = run.downtimeEvents.find(e => e.endTime === null);
          if (activeEvt) {
            productionStorage.endDowntimeEvent(run.id, activeEvt.id);
          }
        }
      }
    }

    prevPrinterStateRef.current = { jetRunning, isRunning };
  }, [connectionState.status?.jetRunning, connectionState.status?.isRunning, connectionState.connectedPrinter?.id, productionStorage]);

  // Auto-sync product count from printer to active production runs
  useEffect(() => {
    const printerId = connectionState.connectedPrinter?.id;
    const productCount = connectionState.status?.productCount;
    if (printerId == null || productCount == null || productCount === 0) return;

    const activeRuns = productionStorage.runs.filter(
      r => r.printerId === printerId && r.endTime === null
    );
    for (const run of activeRuns) {
      if (run.actualCount !== productCount) {
        productionStorage.updateRun(run.id, { actualCount: productCount });
      }
    }
  }, [connectionState.status?.productCount, connectionState.connectedPrinter?.id, productionStorage]);

  const handleNavigate = (item: NavItem) => {
    if (item === 'adjust') {
      setAdjustDialogOpen(true);
      return;
    }
    if (item === 'setup') {
      setSetupDialogOpen(true);
      return;
    }
    if (item === 'service') {
      setServiceDialogOpen(true);
      return;
    }
    if (item === 'datasource') {
      setCurrentScreen('datasource');
      return;
    }
    if (item === 'wirecable') {
      setCurrentScreen('wirecable');
      return;
    }
    setCurrentScreen(item);
  };

  const handleHome = () => {
    setCurrentScreen('home');
  };

  const handleTurnOff = () => {
    if (connectedPrinterId) cancelCountdown(connectedPrinterId);
    disconnect();
    setCurrentScreen('home');
  };

  const isMobile = useIsMobile();
  
  const handleConnect = async (printer: typeof printers[0]) => {
    // Cancel any running countdown from the previous printer
    // Don't cancel countdown — let the previous printer's countdown continue independently
    await connect(printer);
    // On mobile, navigate to full-screen Dashboard
    // On desktop, stay on home screen (Dashboard is embedded in split-view)
    if (isMobile) {
      setCurrentScreen('control');
    }
  };
  
  // Wrapped handlers that trigger countdown
  const handleStartPrint = useCallback(() => {
    jetStart();
    if (connectedPrinterId) startCountdown(connectedPrinterId, 'starting');
  }, [jetStart, startCountdown, connectedPrinterId]);
  
  const handleJetStop = useCallback(() => {
    jetStop();
    if (connectedPrinterId) startCountdown(connectedPrinterId, 'stopping');
  }, [jetStop, startCountdown, connectedPrinterId]);

  // Force Print handler: sends ^PT then advances the data source row for VDP messages
  const handleForcePrint = useCallback(async () => {
    try {
      const result = await sendCommand('^PT');
      if (!result.success) {
        toast.error('Force Print failed: ' + (result.response || 'Unknown error'));
        return;
      }
      toast.success('Force Print triggered');

      // ^PT advances Print/Product/Custom counters on the printer (and emulator).
      // Re-query ^CN immediately so the dashboard preview's {C1}/{CN1} tokens
      // and the counter dialog reflect the new value without waiting for the
      // next 3s polling cycle.
      queryCounters().catch((e) => console.warn('[handleForcePrint] queryCounters failed', e));

      // Check if current message has a linked data source (scoped to connected printer)
      const currentMsg = connectionState.status?.currentMessage;
      if (!currentMsg || !connectedPrinterId) return;

      const { data: job } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('message_name', currentMsg)
        .eq('printer_id', connectedPrinterId)
        .limit(1)
        .maybeSingle();

      if (!job) return; // No data link, nothing to advance

      // Advance to next row (wrap around)
      const nextIndex = (job.current_row_index + 1) % (job.total_rows || 1);

      // Update the row index in the database
      await supabase
        .from('print_jobs')
        .update({ current_row_index: nextIndex })
        .eq('id', job.id);

      // Fetch the next row's data
      const { data: nextRow } = await supabase
        .from('data_source_rows')
        .select('values')
        .eq('data_source_id', job.data_source_id)
        .eq('row_index', nextIndex)
        .maybeSingle();

      if (!nextRow?.values) return;

      // Update the message preview with the new row's data
      const storedMessage = getMessage(currentMsg);
      if (!storedMessage) return;

      const fieldMappings = job.field_mappings as Record<string, string | string[]>;
      const rowValues = nextRow.values as Record<string, string>;

      const updatedFields = storedMessage.fields.map((f, idx) => {
        const fieldNum = idx + 1;
        const mappedCol = Object.entries(fieldMappings).find(([, mapped]) => {
          const mappedFields = Array.isArray(mapped) ? mapped : [mapped];
          return mappedFields.some((v) => parseInt(v, 10) === fieldNum);
        });
        if (mappedCol) {
          const newValue = String(rowValues[mappedCol[0]] ?? f.data);
          if (f.type === 'barcode') {
            const prefixMatch = f.data.match(/^(\[[^\]]+\])\s*/);
            const prefix = prefixMatch ? prefixMatch[1] : '[QR]';
            return { ...f, data: `${prefix} ${newValue}` };
          }
          return { ...f, data: newValue };
        }
        return f;
      });

      saveMessage({ ...storedMessage, fields: updatedFields });
    } catch (e) {
      toast.error('Force Print failed');
      console.error('[handleForcePrint]', e);
    }
  }, [sendCommand, queryCounters, connectionState.status?.currentMessage, getMessage, saveMessage, connectedPrinterId]);


  const getRightPanelContent = (): React.ReactNode | undefined => {
    if (isMobile) return undefined;

    const messageTargetPrinter = selectedPrinter ?? connectionState.connectedPrinter ?? null;
    const isConnectedMessageTarget = messageTargetPrinter?.id === connectionState.connectedPrinter?.id;

    if (currentScreen === 'messages') {
      return (
        <MessagesScreen
          messages={getMessagesForPrinter(messageTargetPrinter)}
          currentMessageName={messageTargetPrinter?.currentMessage ?? connectionState.status?.currentMessage ?? null}
          onSelect={async (message) => {
            if (!messageTargetPrinter) return false;
            // Slaves follow the master's selection — block independent message changes
            if (messageTargetPrinter.role === 'slave') {
              setSlaveBlockPrinterName(messageTargetPrinter.name);
              setSlaveBlockDialogOpen(true);
              return false;
            }
            if (isConnectedMessageTarget) {
              const ok = await selectMessage(message);
              if (ok) {
                clearAllExpiryOverrides();
                await applyStoredAdjustSettings(messageTargetPrinter, message.name);
              }
              return ok;
            }
            const ok = await sendCommandToPrinter(messageTargetPrinter, `^SM ${message.name}`);
            if (ok) {
              updatePrinter(messageTargetPrinter.id, {
                currentMessage: message.name,
                lastSelectionResult: { messageName: message.name, success: true, at: Date.now() },
              });
              clearAllExpiryOverrides();
              await applyStoredAdjustSettings(messageTargetPrinter, message.name);
            } else {
              updatePrinter(messageTargetPrinter.id, {
                lastSelectionResult: { messageName: message.name, success: false, reason: 'No ACK from printer', at: Date.now() },
              });
            }
            return ok;
          }}
          onFetchMessageDetails={isConnectedMessageTarget ? fetchMessageContent : undefined}
          onSendCommand={async (cmd) => {
            if (isConnectedMessageTarget) {
              await sendCommand(cmd);
            } else if (messageTargetPrinter) {
              await sendCommandToPrinter(messageTargetPrinter, cmd);
            }
          }}
          onApplyPromptValues={(message, updatedDetails) => applyPromptValuesToPrinter(messageTargetPrinter, message, updatedDetails)}
          onGetStoredMessage={(name) => getStoredMessageForPrinter(name, messageTargetPrinter)}
          onSaveMessageContent={isConnectedMessageTarget ? saveMessageContent : undefined}
          onSaveStoredMessage={(details) => saveMessage(normalizeMessageForPrinter(details), messageTargetPrinter?.id)}
          connectedPrinterLineId={messageTargetPrinter?.lineId}
          liveCounters={connectionState.status?.customCounters}
          onPromptSaved={(details) => {
            const normalized = normalizeMessageForPrinter(details);
            setActiveMessageContent(normalized);
            recentlySavedRef.current.set(normalized.name, Date.now());
            // Push the baked prompt values (e.g. ZZZ) to all slaves so their
            // User Define field updates too — saveMessageContent itself only
            // writes to the connected master.
            syncMessageToSlaves(normalized.name, normalized, false);
          }}
          onEdit={(message) => {
            setIsCreatingNewMessage(false);
            setEditingMessage(message);
            setCurrentScreen('editMessage');
          }}
          onNew={(name: string, preset?: 'metrc-retail-id') => {
            addMessage(name);
            const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
            setIsCreatingNewMessage(true);
            setMessagePreset(preset);
            setEditingMessage({ id: newId, name });
            setCurrentScreen('editMessage');
          }}
          onDelete={(message) => {
            deleteMessage(message.id);
            deleteStoredMessage(message.name, messageTargetPrinter?.id);
          }}
          onHome={() => setCurrentScreen('home')}
          openNewDialogOnMount={openNewDialogOnMount}
          onNewDialogOpened={() => setOpenNewDialogOnMount(false)}
          allPcLibraryMessages={getAllPcLibraryMessages()}
          printerNameMap={Object.fromEntries(printers.map(p => [p.id, p.name]))}
          pcLibraryMessages={getPcLibraryMessages(messageTargetPrinter?.id)}
          onSaveToPcLibrary={(message) => handleSaveToPcLibrary(message, messageTargetPrinter)}
          onPushToprinter={(libMsg, swapName) => pushPcLibraryToPrinter(libMsg, swapName, messageTargetPrinter)}
          onDeleteFromPcLibrary={(name, sourcePrinterId) => deleteFromPcLibrary(name, sourcePrinterId)}
          swapSlotName={getSwapSlot(messageTargetPrinter?.id)}
          onSetSwapSlot={(name) => setSwapSlot(name, messageTargetPrinter?.id)}
          isSlave={messageTargetPrinter?.role === 'slave'}
          onSlaveBlocked={() => {
            if (messageTargetPrinter) {
              setSlaveBlockPrinterName(messageTargetPrinter.name);
              setSlaveBlockDialogOpen(true);
            }
          }}
        />
      );
    }

    if (currentScreen === 'editMessage' && editingMessage) {
      return (
        <EditMessageScreen
          key={`${editingMessage.name}-${isCreatingNewMessage ? 'new' : 'edit'}`}
          messageName={editingMessage.name}
          startEmpty={isCreatingNewMessage}
          preset={messagePreset}
          printerTime={connectionState.status?.printerTime}
          customCounters={connectionState.status?.customCounters}
          connectedPrinterId={connectionState.connectedPrinter?.id ?? null}
          connectedPrinterLineId={connectionState.connectedPrinter ? printers.find(p => p.id === connectionState.connectedPrinter!.id)?.lineId : undefined}
          isConnected={connectionState.isConnected}
          printerModel={connectionState.status?.printerModel}
          printerVariant={connectionState.status?.printerVariant}
          currentAdjustSettings={connectionState.settings}
          onSendCommand={sendCommand}
          onSave={saveEditedMessage}
          onCancel={() => {
            setCurrentScreen('messages');
            setEditingMessage(null);
            setIsCreatingNewMessage(false);
            setMessagePreset(undefined);
          }}
          onGetMessageDetails={async (name: string) => {
            // If connected, always fetch fresh from printer to catch HMI edits
            if (connectionState.isConnected) {
              try {
                // Timeout after 10s to prevent editor from hanging
                const fetched = await Promise.race([
                  fetchMessageContent(name),
                  new Promise<null>(r => setTimeout(() => r(null), 10000)),
                ]);
                if (fetched && fetched.fields.length > 0) {
                  const cached = getStoredMessageForPrinter(name, messageTargetPrinter);
                  const merged = mergeAutoCodeMeta(fetched, cached, !!cached?.templateValue);
                  saveMessage(merged, messageTargetPrinter?.id);
                  return merged;
                }
              } catch (e) {
                console.error('[onGetMessageDetails] fetch failed:', e);
              }
            }
            // Fallback to local storage
            return getStoredMessageForPrinter(name, messageTargetPrinter);
          }}
        />
      );
    }

    return undefined;
  };

  const renderScreen = () => {
    switch (currentScreen) {
      // 'network' case removed - now handled in DevPanel Network tab
      case 'control':
        return (
          <Dashboard
            status={connectionState.status}
            isConnected={connectionState.isConnected}
            messageContent={activeMessageContent}
            onStart={handleStartPrint}
            onStop={stopPrint}
            onJetStop={handleJetStop}
            onHvOn={startPrint}
            onHvOff={stopPrint}
            onNewMessage={() => {
              const tp = connectionState.connectedPrinter;
              if (tp?.role === 'slave') {
                setSlaveBlockPrinterName(tp.name);
                setSlaveBlockDialogOpen(true);
                return;
              }
              setOpenNewDialogOnMount(true);
              setCurrentScreen('messages');
            }}
            onEditMessage={() => setCurrentScreen('messages')}
            onSignIn={async () => {
              if (isSignedIn) {
                const success = await signOut();
                if (success) {
                  setIsSignedIn(false);
                }
              } else {
                setSignInDialogOpen(true);
              }
            }}
            onHelp={() => setHelpDialogOpen(true)}
            onResetCounter={resetCounter}
            onResetAllCounters={resetAllCounters}
            onQueryCounters={queryCounters}
            isSignedIn={isSignedIn}
            countdownSeconds={countdownSeconds}
            countdownType={countdownType}
            onNavigate={handleNavigate}
            onTurnOff={handleTurnOff}
            onHome={isMobile ? () => setCurrentScreen('home') : undefined}
            selectedPrinterId={connectionState.connectedPrinter?.id}
            streamHours={connectionState.metrics?.streamHours}
            printerModel={connectionState.status?.printerModel}
            printerVariant={connectionState.status?.printerVariant}
            selectedPrinterLineId={connectionState.connectedPrinter ? printers.find(p => p.id === connectionState.connectedPrinter!.id)?.lineId : undefined}
            printerExpiryOffset={connectionState.connectedPrinter ? printers.find(p => p.id === connectionState.connectedPrinter!.id)?.expiryOffsetDays : undefined}
            isSlave={connectionState.connectedPrinter?.role === 'slave'}
          />
        );
      case 'editMessage':
        // On mobile, render full-screen; on desktop, handled via rightPanelContent
        if (!isMobile) {
          // Fall through to default (PrintersScreen with rightPanelContent)
          break;
        }
        return editingMessage ? (
          <EditMessageScreen
            key={`${editingMessage.name}-${isCreatingNewMessage ? 'new' : 'edit'}`}
            messageName={editingMessage.name}
            startEmpty={isCreatingNewMessage}
            preset={messagePreset}
            printerTime={connectionState.status?.printerTime}
            customCounters={connectionState.status?.customCounters}
            connectedPrinterId={connectionState.connectedPrinter?.id ?? null}
            connectedPrinterLineId={connectionState.connectedPrinter ? printers.find(p => p.id === connectionState.connectedPrinter!.id)?.lineId : undefined}
            isConnected={connectionState.isConnected}
            printerModel={connectionState.status?.printerModel}
            printerVariant={connectionState.status?.printerVariant}
            currentAdjustSettings={connectionState.settings}
            onSendCommand={sendCommand}
          onSave={saveEditedMessage}
            onCancel={() => {
              setCurrentScreen('messages');
              setEditingMessage(null);
              setIsCreatingNewMessage(false);
              setMessagePreset(undefined);
            }}
            onGetMessageDetails={async (name: string) => {
              if (connectionState.isConnected) {
                try {
                  const fetched = await Promise.race([
                    fetchMessageContent(name),
                    new Promise<null>(r => setTimeout(() => r(null), 10000)),
                  ]);
                  if (fetched && fetched.fields.length > 0) {
                    const cached = getMessage(name) ?? null;
                    const merged = mergeAutoCodeMeta(fetched, cached, !!cached?.templateValue);
                    saveMessage(merged);
                    return merged;
                  }
                } catch (e) {
                  console.error('[onGetMessageDetails] fetch failed:', e);
                }
              }
              return getMessage(name);
            }}
          />
        ) : null;
      case 'messages':
        // On mobile, render full-screen; on desktop, handled via rightPanelContent
        if (!isMobile) {
          break;
        }
        return (
          <MessagesScreen
            messages={getMessagesForPrinter(selectedPrinter ?? connectionState.connectedPrinter ?? null)}
            currentMessageName={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.currentMessage ?? connectionState.status?.currentMessage ?? null}
            onSelect={async (message) => {
              const messageTargetPrinter = selectedPrinter ?? connectionState.connectedPrinter ?? null;
              if (!messageTargetPrinter) return false;
              // Slaves follow the master's selection — block independent message changes
              if (messageTargetPrinter.role === 'slave') {
                setSlaveBlockPrinterName(messageTargetPrinter.name);
                setSlaveBlockDialogOpen(true);
                return false;
              }
              if (messageTargetPrinter.id === connectionState.connectedPrinter?.id) {
                const ok = await selectMessage(message);
                if (ok) {
                  clearAllExpiryOverrides();
                  await applyStoredAdjustSettings(messageTargetPrinter, message.name);
                }
                return ok;
              }
              const ok = await sendCommandToPrinter(messageTargetPrinter, `^SM ${message.name}`);
              if (ok) {
                updatePrinter(messageTargetPrinter.id, {
                  currentMessage: message.name,
                  lastSelectionResult: { messageName: message.name, success: true, at: Date.now() },
                });
                clearAllExpiryOverrides();
                await applyStoredAdjustSettings(messageTargetPrinter, message.name);
              } else {
                updatePrinter(messageTargetPrinter.id, {
                  lastSelectionResult: { messageName: message.name, success: false, reason: 'No ACK from printer', at: Date.now() },
                });
              }
              return ok;
            }}
            onFetchMessageDetails={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id === connectionState.connectedPrinter?.id ? fetchMessageContent : undefined}
            onSendCommand={async (cmd) => {
              const target = selectedPrinter ?? connectionState.connectedPrinter ?? null;
              if (target?.id === connectionState.connectedPrinter?.id) {
                await sendCommand(cmd);
              } else if (target) {
                await sendCommandToPrinter(target, cmd);
              }
            }}
            onApplyPromptValues={(message, updatedDetails) => applyPromptValuesToPrinter(selectedPrinter ?? connectionState.connectedPrinter ?? null, message, updatedDetails)}
            onGetStoredMessage={(name) => getStoredMessageForPrinter(name, selectedPrinter ?? connectionState.connectedPrinter ?? null)}
            onSaveMessageContent={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id === connectionState.connectedPrinter?.id ? saveMessageContent : undefined}
            onSaveStoredMessage={(details) => saveMessage(normalizeMessageForPrinter(details), (selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id)}
            connectedPrinterLineId={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.lineId}
            liveCounters={connectionState.status?.customCounters}
            onPromptSaved={(details) => {
              const normalized = normalizeMessageForPrinter(details);
              setActiveMessageContent(normalized);
              recentlySavedRef.current.set(normalized.name, Date.now());
            }}
            onEdit={(message) => {
              setIsCreatingNewMessage(false);
              setEditingMessage(message);
              setCurrentScreen('editMessage');
            }}
              onNew={(name: string, preset?: 'metrc-retail-id') => {
              addMessage(name);
              const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
              setIsCreatingNewMessage(true);
              setMessagePreset(preset);
              setEditingMessage({ id: newId, name });
              setCurrentScreen('editMessage');
            }}
            onDelete={(message) => {
              deleteMessage(message.id);
              deleteStoredMessage(message.name, (selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id);
            }}
            onHome={() => setCurrentScreen('control')}
            openNewDialogOnMount={openNewDialogOnMount}
            onNewDialogOpened={() => setOpenNewDialogOnMount(false)}
            allPcLibraryMessages={getAllPcLibraryMessages()}
            printerNameMap={Object.fromEntries(printers.map(p => [p.id, p.name]))}
            pcLibraryMessages={getPcLibraryMessages((selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id)}
            onSaveToPcLibrary={(message) => handleSaveToPcLibrary(message, selectedPrinter ?? connectionState.connectedPrinter ?? null)}
            onPushToprinter={(libMsg, swapName) => pushPcLibraryToPrinter(libMsg, swapName, selectedPrinter ?? connectionState.connectedPrinter ?? null)}
            onDeleteFromPcLibrary={(name, sourcePrinterId) => deleteFromPcLibrary(name, sourcePrinterId)}
            swapSlotName={getSwapSlot((selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id)}
            onSetSwapSlot={(name) => setSwapSlot(name, (selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id)}
            isSlave={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.role === 'slave'}
            onSlaveBlocked={() => {
              const tp = selectedPrinter ?? connectionState.connectedPrinter ?? null;
              if (tp) {
                setSlaveBlockPrinterName(tp.name);
                setSlaveBlockDialogOpen(true);
              }
            }}
          />
        );
      case 'wirecable':
        return (
          <WireCableScreen
            onHome={handleHome}
            settings={connectionState.settings}
            onUpdate={updateSettings}
            onSendCommand={sendCommand}
            isConnected={connectionState.isConnected}
            printCount={connectionState.status?.printCount ?? 0}
            productCount={connectionState.status?.productCount ?? 0}
            currentMessage={connectionState.status?.currentMessage ? getMessage(connectionState.status.currentMessage) : null}
          />
        );
      case 'clean':
        return <CleanScreen onHome={handleHome} />;
      case 'setup':
        // Now handled as dialog
        break;
      case 'service':
        // Now handled as dialog
        break;
      case 'consumables': {
        // In Lite mode (no network), only show the connected printer or first printer
        const consumablePrinters = canNetwork ? printers : printers.filter(p => 
          connectedPrinterId ? p.id === connectedPrinterId : p.id === printers[0]?.id
        );
        return (
          <ConsumablesScreen
            reorderConfig={consumableStorage.reorderConfig}
            onUpdateReorderConfig={consumableStorage.updateReorderConfig}
            consumables={consumableStorage.consumables}
            assignments={consumableStorage.assignments}
            printers={consumablePrinters}
            metricsMap={connectionState.connectedPrinter && connectionState.metrics
              ? { [connectionState.connectedPrinter.id]: connectionState.metrics }
              : {}
            }
            onQueryPrinterMetrics={queryPrinterMetrics}
            onAddConsumable={consumableStorage.addConsumable}
            onUpdateConsumable={consumableStorage.updateConsumable}
            onRemoveConsumable={consumableStorage.removeConsumable}
            onSetStock={consumableStorage.setStock}
            onAdjustStock={consumableStorage.adjustStock}
            onAssignConsumable={consumableStorage.assignConsumable}
            onHome={handleHome}
          />
        );
      }
      case 'reports': {
        // In Lite mode (no network), only show the connected printer or first printer
        const reportPrinters = canNetwork ? printers : printers.filter(p => 
          connectedPrinterId ? p.id === connectedPrinterId : p.id === printers[0]?.id
        );
        const reportRuns = canNetwork ? productionStorage.runs : productionStorage.runs.filter(r => 
          reportPrinters.some(p => p.id === r.printerId)
        );
        return (
          <ReportsScreen
            runs={reportRuns}
            snapshots={productionStorage.snapshots}
            printers={reportPrinters}
            onAddRun={productionStorage.addRun}
            onUpdateRun={productionStorage.updateRun}
            onDeleteRun={productionStorage.deleteRun}
            onAddDowntime={productionStorage.addDowntimeEvent}
            onEndDowntime={productionStorage.endDowntimeEvent}
            onHome={handleHome}
          />
        );
      }
      case 'datasource':
        return (
          <DataSourceScreen
            onHome={handleHome}
            messages={connectionState.messages}
            isConnected={connectionState.isConnected}
            connectedPrinterId={connectionState.connectedPrinter?.id ?? null}
            onSendCommand={sendCommand}
          />
        );
      case 'training':
        return (
          <TrainingVideosScreen
            onBack={handleHome}
            recorderState={screenRecorder.state}
            recorderActions={screenRecorder.actions}
          />
        );
    }
    
    // Default / home / desktop messages+editMessage: render PrintersScreen
    return (
      <PrintersScreen
        printers={printers}
        onConnect={handleConnect}
        onHome={handleHome}
        onAddPrinter={addPrinter}
        onRemovePrinter={removePrinter}
        onReorderPrinters={reorderPrinters}
        onUpdatePrinter={async (printerId, updates) => {
          const existing = printers.find(p => p.id === printerId);
          const ipOrPortChanged = !!existing && (
            (updates.ipAddress !== undefined && updates.ipAddress !== existing.ipAddress) ||
            (updates.port !== undefined && updates.port !== existing.port)
          );
          if (ipOrPortChanged) {
            // Tear down the cached TCP socket so the next command opens a fresh
            // connection to the new IP/port. Without this, the renderer keeps
            // talking to the old printer even though the UI shows the new IP.
            try {
              if (connectionState.connectedPrinter?.id === printerId) {
                await disconnect();
              } else {
                await printerTransport.disconnect(printerId);
              }
            } catch (e) {
              console.warn('[updatePrinter] disconnect-on-IP-change failed:', e);
            }
          }
          updatePrinter(printerId, updates);
        }}
        onQueryPrinterMetrics={queryPrinterMetrics}
        isDevSignedIn={isDevSignedIn}
        onDevSignIn={() => setDevSignInDialogOpen(true)}
        onDevSignOut={() => { setIsDevSignedIn(false); setDevPanelOpen(false); setDevPanelTab(undefined); }}
        isConnected={connectionState.isConnected}
        connectedPrinter={connectionState.connectedPrinter}
        status={connectionState.status}
        onStart={handleStartPrint}
        onStop={stopPrint}
        onJetStop={handleJetStop}
        onHvOn={startPrint}
        onHvOff={stopPrint}
        onNewMessage={() => {
          const tp = selectedPrinter ?? connectionState.connectedPrinter ?? null;
          if (tp?.role === 'slave') {
            setSlaveBlockPrinterName(tp.name);
            setSlaveBlockDialogOpen(true);
            return;
          }
          setOpenNewDialogOnMount(true);
          setCurrentScreen('messages');
        }}
        onEditMessage={() => setCurrentScreen('messages')}
        onSignIn={async () => {
          if (isSignedIn) {
            const success = await signOut();
            if (success) {
              setIsSignedIn(false);
            }
          } else {
            setSignInDialogOpen(true);
          }
        }}
        onHelp={() => setHelpDialogOpen(true)}
        onResetCounter={resetCounter}
        onResetAllCounters={resetAllCounters}
        onQueryCounters={queryCounters}
        isSignedIn={isSignedIn}
        countdownSeconds={countdownSeconds}
        countdownType={countdownType}
        messageContent={activeMessageContent}
        onControlMount={() => setControlScreenOpen(true)}
        onControlUnmount={() => setControlScreenOpen(false)}
        onNavigate={handleNavigate}
        onTurnOff={handleTurnOff}
        onSyncMaster={async (masterId) => {
          // If the master is the currently connected printer, push full message
          // content (^DM → ^NM → ^SV via replaceMessageWithoutDelete) for every
          // message. Bare `^NM <name>` won't populate fields on the slave.
          const isConnectedMaster =
            connectionState.connectedPrinter?.id === masterId && isMaster;
          if (!isConnectedMaster) {
            // Fallback: at least push message names (best-effort for masters we
            // aren't currently connected to — full content isn't cached).
            await syncMaster(masterId);
            toast.info('Slave sync: only message names pushed (master not connected)');
            return;
          }

          // Include OFFLINE slaves so they get flagged OUT OF SYNC instead
          // of silently skipped. syncMessageToSlaves records them as failed
          // with reason 'offline'.
          const slaves = getSlavesForMaster(masterId);
          const onlineSlaveCount = slaves.filter(s => s.isAvailable).length;
          if (slaves.length === 0) {
            toast.warning('No slaves configured for this master');
            return;
          }
          if (onlineSlaveCount === 0) {
            toast.warning('All slaves are offline — nothing to sync');
            return;
          }
          const messagesToPush = connectionState.messages ?? [];
          if (messagesToPush.length === 0) {
            toast.warning('No messages to sync');
            return;
          }

          // Skip factory/preset messages that already exist on every slave
          // (BestCode, BestCode Auto, Quantum, Quantum Auto, Moba).
          const filtered = messagesToPush.filter(m => !isPresetMessage(m.name));
          const skipped = messagesToPush.length - filtered.length;
          console.log('[SyncSlaves] master messages:', messagesToPush.map(m => m.name));
          console.log('[SyncSlaves] skipped as preset:', messagesToPush.filter(m => isPresetMessage(m.name)).map(m => m.name));



          if (filtered.length === 0) {
            toast.info(`Nothing to sync — all ${messagesToPush.length} message(s) are pre-installed on slaves`);
            return;
          }

          setPollingPaused(true);
          const offlineCount = slaves.length - onlineSlaveCount;
          const t = toast.loading(`Syncing ${filtered.length} message(s) to ${onlineSlaveCount} online slave(s)${offlineCount ? ` — ${offlineCount} offline will be flagged` : ''}${skipped ? ` (skipping ${skipped} pre-installed)` : ''}…`);
          try {
            await waitForPollingIdle(3000);
            // Aggregate outcomes per-slave across every message pushed so we
            // can report accurate success/failure and flag any slave that
            // didn't accept the full push as OUT OF SYNC.
            const slaveOutcomes = new Map<number, { name: string; failures: Array<{ messageName: string; reason: string }> }>();
            for (const s of slaves) slaveOutcomes.set(s.id, { name: s.name, failures: [] });

            let msgOkCount = 0;
            for (const m of filtered) {
              const details = getMessage(m.name);
              if (!details || details.fields.length === 0) continue;
              const perSlave = await syncMessageToSlaves(m.name, details, false);
              const allOk = perSlave.length > 0 && perSlave.every(r => r.ok);
              if (allOk) msgOkCount += 1;
              for (const r of perSlave) {
                if (!r.ok) {
                  slaveOutcomes.get(r.slaveId)?.failures.push({ messageName: m.name, reason: r.reason ?? 'unknown' });
                }
              }
            }

            // Flag slaves: any failure → OUT OF SYNC; otherwise clear.
            const failedSlaves: Array<{ name: string; failures: Array<{ messageName: string; reason: string }> }> = [];
            for (const [slaveId, outcome] of slaveOutcomes) {
              if (outcome.failures.length > 0) {
                failedSlaves.push(outcome);
                const first = outcome.failures[0];
                updatePrinter(slaveId, {
                  syncOutOfDate: true,
                  syncLastFailure: { messageName: first.messageName, reason: first.reason, at: Date.now() },
                });
              } else {
                updatePrinter(slaveId, { syncOutOfDate: false, syncLastFailure: null });
              }
            }

            if (failedSlaves.length === 0) {
              toast.success(`Synced ${msgOkCount}/${filtered.length} message(s) to ${slaves.length} slave(s)${skipped ? ` — skipped ${skipped} pre-installed` : ''}`, { id: t });
            } else {
              const summary = failedSlaves
                .map(s => `${s.name} (${s.failures.length} msg${s.failures.length === 1 ? '' : 's'}: ${s.failures.slice(0, 2).map(f => `${f.messageName}→${f.reason}`).join(', ')}${s.failures.length > 2 ? '…' : ''})`)
                .join(' • ');
              toast.error(`Sync partial: ${failedSlaves.length}/${slaves.length} slave(s) failed — ${summary}`, {
                id: t,
                duration: 10000,
              });
              console.warn('[SyncSlaves] Per-slave failures:', Array.from(slaveOutcomes.values()));
            }
          } catch (err: any) {
            console.error('[SyncSlaves] Failed:', err);
            toast.error(`Slave sync failed: ${err?.message ?? 'unknown error'}`, { id: t });
          } finally {
            setTimeout(() => setPollingPaused(false), 1000);
          }
        }}
        onBroadcastMessage={async (masterId, messageName, slaveValues) => {
          // Compute the absolute field number for the prompted field
          const stored = getMessage(messageName);
          let userDefineFieldNum: number | undefined;
          if (stored) {
            const idx = stored.fields.findIndex(f => f.promptBeforePrint);
            if (idx >= 0) userDefineFieldNum = idx + 1; // 1-indexed
          }
          // Pause polling while we push ^SM + ^MD^TD to all slaves to avoid
          // TCP contention on port 23 (single-session limit per printer).
          setPollingPaused(true);
          try {
            const idle = await waitForPollingIdle(3000);
            if (!idle) console.warn('[Broadcast] Polling still active, proceeding anyway');
            await broadcastMessage(masterId, messageName, slaveValues, userDefineFieldNum);
          } finally {
            setTimeout(() => setPollingPaused(false), 1000);
          }
        }}
        getSlavesForMaster={getSlavesForMaster}
        connectedMessages={connectionState.messages}
        rightPanelContent={getRightPanelContent()}
        onSelectedPrinterChange={(printer) => setSelectedPrinterId(printer?.id ?? null)}
        getMessageContent={getMessage}
        getCountdown={getCountdown}
        onConsumables={() => setCurrentScreen('consumables')}
        onReports={() => setCurrentScreen('reports')}
        lowStockCount={consumableStorage.getLowStockConsumables().length}
        connectedMetrics={connectionState.metrics}
        onLicense={() => setLicenseDialogOpen(true)}
        onRefreshNetwork={checkPrinterStatus}
        isCheckingNetwork={isChecking}
        onSlaveExpiryChange={handleExpiryOffsetChange}
      />
    );
  };

  const { isActivated, isLoading: licenseLoading, error: licenseError, canNetwork } = useLicense();

  // Full lockout: if no valid license, show only the activation dialog
  if (!isActivated && !licenseLoading) {
    return (
      <div className="min-h-dvh h-dvh flex flex-col items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl mb-2">🔒</div>
          <h1 className="text-2xl font-bold text-foreground">License Required</h1>
          <p className="text-muted-foreground text-sm">
            {licenseError || 'A valid product key is required to use CodeSync™. Please enter your license key to continue.'}
          </p>
          <Button onClick={() => setLicenseDialogOpen(true)} className="mt-4">
            Enter Product Key
          </Button>
        </div>
        <LicenseActivationDialog
          open={licenseDialogOpen}
          onOpenChange={setLicenseDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh h-dvh overflow-hidden flex flex-col bg-background">
      <Header
        isConnected={connectionState.isConnected}
        connectedIp={connectionState.connectedPrinter?.ipAddress}
        onSettings={() => {
          setDevPanelTab('network');
          setDevPanelOpen(true);
        }}
        onHome={currentScreen !== 'home' ? handleHome : undefined}
        printerTime={connectionState.status?.printerTime}
        onRelayConnect={() => setRelayDialogOpen(true)}
        printerModel={connectionState.status?.printerModel}
        printerVariant={connectionState.status?.printerVariant}
        onTrainingVideos={() => setCurrentScreen('training')}
      />

      {/* Floating recording overlay - visible in main screen when recording */}
      {screenRecorder.state.isRecording && (
        <RecordingOverlay
          elapsed={screenRecorder.state.elapsed}
          onStop={screenRecorder.actions.stopRecording}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {renderScreen()}
      </main>

      {/* BottomNav and Footer now rendered inside Dashboard/PrintersScreen right panel */}

      {/* Dev Panel - only rendered when authenticated via CITEC */}
      {isDevSignedIn ? (
        <DevPanel 
          isOpen={devPanelOpen} 
          onToggle={() => {
            const closing = devPanelOpen;
            setDevPanelOpen(!devPanelOpen);
            if (closing) {
              setDevPanelTab(undefined);
              // When dev panel closes, immediately attempt socket reconnect
              // in case polling was disrupted while the panel was open.
              setTimeout(() => refreshPolling(), 100);
            }
          }}
          connectedPrinterIp={connectionState.connectedPrinter?.ipAddress}
          connectedPrinterPort={connectionState.connectedPrinter?.port}
          connectedPrinterId={connectionState.connectedPrinter?.id}
          defaultTab={devPanelTab}
          showToggleButton={isDevSignedIn}
          recorderState={screenRecorder.state}
          recorderActions={screenRecorder.actions}
        />
      ) : null}
      
      {/* Printer Sign In Dialog */}
      <SignInDialog
        open={signInDialogOpen}
        onOpenChange={setSignInDialogOpen}
        onSignIn={async (password) => {
          const success = await signIn(password);
          if (success) {
            setIsSignedIn(true);
          }
          return success;
        }}
      />
      
      {/* Dev Portal Sign In Dialog (TOTP-based; only developer-flagged licenses can open this) */}
      <DevSignInDialog
        open={devSignInDialogOpen}
        onOpenChange={setDevSignInDialogOpen}
        onSuccess={() => setIsDevSignedIn(true)}
      />
      
      {/* Adjust Dialog */}
      <AdjustDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        settings={connectionState.settings}
        onUpdate={updateSettings}
        onSendCommand={sendCommand}
        isConnected={connectionState.isConnected}
        title="Adjust Settings (Global)"
      />

      {/* Help Dialog */}
      <HelpDialog
        open={helpDialogOpen}
        onOpenChange={setHelpDialogOpen}
        onSendCommand={sendCommand}
        isConnected={connectionState.isConnected}
      />

      {/* Setup Dialog */}
      <SetupScreen
        open={setupDialogOpen}
        onOpenChange={setSetupDialogOpen}
        onSendCommand={sendCommand}
      />

      {/* Service Dialog */}
      <ServiceScreen
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        metrics={connectionState.metrics}
        onMount={() => setServiceScreenOpen(true)}
        onUnmount={() => setServiceScreenOpen(false)}
        onSendCommand={sendCommand}
        onForcePrint={handleForcePrint}
      />

      {/* Relay Connect Dialog (mobile PWA) */}
      <RelayConnectDialog
        open={relayDialogOpen}
        onOpenChange={setRelayDialogOpen}
      />

      {/* Low Stock Alert Popup */}
      <LowStockAlert
        reorderConfig={consumableStorage.reorderConfig}
        alert={lowStockAlertQueue.length > 0 ? lowStockAlertQueue[0] : null}
        onDismiss={() => setLowStockAlertQueue(prev => prev.slice(1))}
        onNavigateToConsumables={() => {
          setLowStockAlertQueue(prev => prev.slice(1));
          setCurrentScreen('consumables');
        }}
      />

      {/* License Activation Dialog */}
      <LicenseActivationDialog
        open={licenseDialogOpen}
        onOpenChange={setLicenseDialogOpen}
      />

      {/* Printer Fault Alert (dismisses on OK, re-appears after 3 min) */}
      <FaultAlertDialog
        faults={activeFaults}
        isConnected={connectionState.isConnected}
        onDismissFault={sendCommand}
      />

      {/* Mobile companion: pause/resume polling FAB */}
      <PausePollingButton />

      {/* Slave message selection block dialog */}
      <AlertDialog open={slaveBlockDialogOpen} onOpenChange={setSlaveBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slave Printer</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              <strong>{slaveBlockPrinterName}</strong> is a slave printer. It automatically follows the master's message library and selection — new messages, edits, and deletions must be performed on the master printer and will sync to this slave.
              <br /><br />
              To manage messages directly on this printer, edit it and change its role to <strong>Standalone</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Index;
