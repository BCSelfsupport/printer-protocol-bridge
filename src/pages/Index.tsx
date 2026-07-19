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
import { PrintSettings, FLEET_DEFAULT_ADJUST_SETTINGS } from '@/types/printer';
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

import { UserDefineEntryDialog, UserDefinePrompt } from '@/components/messages/UserDefineEntryDialog';
import { RetryFailuresDialog, RetryFailureItem } from '@/components/messages/RetryFailuresDialog';
import { isRelayMode, printerTransport } from '@/lib/printerTransport';
import { buildTokenMap, resolveAllFields } from '@/lib/tokenResolver';
import { runFleetWriteExclusive, runPrinterWriteExclusive } from '@/lib/printerWriteQueue';
import { beginSaveBusy, waitForSaveIdle } from '@/lib/saveBusy';
import { isPresetMessage } from '@/lib/hardcodedMessages';
import { isMessageProtected } from '@/lib/protectedMessages';
import { recordMessageSent, getPrintersThatHaveRun, getLastSentAt, backfillFromStoredKeys, pruneRemovedPrinters } from '@/lib/messageSentHistory';
import type { OtherPrinterRow } from '@/components/messages/MessageOnOtherPrintersPanel';




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

const SPEED_TO_PROTOCOL_CODE: Record<PrintSettings['speed'], number> = {
  Fast: 0,
  Faster: 1,
  Fastest: 2,
  'Ultra Fast': 3,
};

const ROTATION_TO_PROTOCOL_CODE: Record<PrintSettings['rotation'], number> = {
  Normal: 0,
  Flip: 1,
  Mirror: 2,
  'Mirror Flip': 3,
};

const PRINT_MODE_TO_PROTOCOL_CODE: Record<string, number> = {
  Normal: 0,
  Auto: 1,
  Repeat: 2,
  Reverse: 3,
  'Auto Encoder': 5,
  'Auto Encoder Reverse': 6,
};

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
  // WP-4: Retry / Ignore dialog for failed copy pushes.
  const [copyRetryState, setCopyRetryState] = useState<{
    source: Printer;
    message: PrintMessage;
    failures: RetryFailureItem[];
    failedTargets: Printer[];
    attempt: number;
  } | null>(null);
  
  
  
  // Local message storage (persists to localStorage, scoped by printer ID)
  const { messages: allStoredMessages, saveMessage, getMessage, getMessageStrict, deleteMessage: deleteStoredMessage, setPrinterId: setStoragePrinterId, saveToPcLibrary, getAllPcLibraryMessages, getPcLibraryMessages, deleteFromPcLibrary, getSwapSlot, setSwapSlot } = useMessageStorage();
  
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
    armStopJetGrace,
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
    queryPrintSettingsForPrinter,
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

  // WP-7 migration & safety: on first mount, backfill sent-history for
  // messages that already exist in storage (so pre-check in Copy/Select
  // dialogs works for pre-existing deployments), and prune history entries
  // for printers that have since been removed from the fleet.
  const didRunHistoryMigrationRef = useRef(false);
  useEffect(() => {
    if (didRunHistoryMigrationRef.current) return;
    if (!allStoredMessages) return;
    didRunHistoryMigrationRef.current = true;
    try {
      backfillFromStoredKeys(Object.keys(allStoredMessages));
      pruneRemovedPrinters(printers.map(p => p.id));
    } catch (e) {
      console.warn('[WP-7] history migration failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStoredMessages]);

  
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

  const buildEffectiveMessageDependentSettings = useCallback((
    details: MessageDetails,
    targetPrinter?: Printer | null,
  ) => {
    // Fall back to the fleet-wide defaults (W2, D500, Ultra Fast) instead of
    // whatever the HMI is currently showing. Legacy messages that never had
    // adjustSettings persisted would otherwise inherit stale HMI values like
    // W15/D200 on every select.
    const effectiveSpeed = details.adjustSettings?.speed
      ?? details.settings?.speed
      ?? FLEET_DEFAULT_ADJUST_SETTINGS.speed;
    // Per-printer rotation override (from the printer setup card) always wins
    // over any rotation stored in the message. When a target printer is
    // supplied (slave sync, copy-to-printers, apply-adjust to a non-connected
    // printer), use THAT printer's rotation — not the currently connected
    // one — so each printer honors its own setup-card setting.
    const rotationPrinter = targetPrinter ?? connectionState.connectedPrinter;
    const effectiveRotation = rotationPrinter?.rotation
      ?? details.adjustSettings?.rotation
      ?? details.settings?.rotation
      ?? FLEET_DEFAULT_ADJUST_SETTINGS.rotation;
    const effectivePrintMode = details.settings?.printMode ?? 'Normal';

    const fullAdjustSettings: PrintSettings = {
      ...connectionState.settings,
      width: details.adjustSettings?.width ?? FLEET_DEFAULT_ADJUST_SETTINGS.width,
      height: details.adjustSettings?.height ?? FLEET_DEFAULT_ADJUST_SETTINGS.height,
      delay: details.adjustSettings?.delay ?? FLEET_DEFAULT_ADJUST_SETTINGS.delay,
      bold: details.adjustSettings?.bold ?? FLEET_DEFAULT_ADJUST_SETTINGS.bold,
      gap: details.adjustSettings?.gap ?? FLEET_DEFAULT_ADJUST_SETTINGS.gap,
      pitch: details.adjustSettings?.pitch ?? FLEET_DEFAULT_ADJUST_SETTINGS.pitch,
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
  }, [connectionState.settings, connectionState.connectedPrinter?.rotation]);


  const buildMessageDependentCommandSequence = useCallback(({
    adjustSettings,
    fullAdjustSettings,
    perMessageSettings,
    includeMessageSettings,
    includeMessageSettingsCommand = false,
  }: {
    adjustSettings?: MessageDetails['adjustSettings'] | null;
    fullAdjustSettings: PrintSettings;
    perMessageSettings: {
      speed: PrintSettings['speed'];
      rotation: PrintSettings['rotation'];
      printMode: string;
    };
    includeMessageSettings: boolean;
    includeMessageSettingsCommand?: boolean;
  }): SequencedPrinterCommand[] => {
    const commands: SequencedPrinterCommand[] = [];

    // During a message save, speed/orientation/print-mode are embedded in ^NM
    // and we must not send an immediate follow-up ^CM. During a plain ^SM
    // selection, however, ^CM is required so the selected stored message adopts
    // its saved per-printer speed/rotation before ^SV persists it.
    if (includeMessageSettings && includeMessageSettingsCommand) {
      const speedCode = SPEED_TO_PROTOCOL_CODE[perMessageSettings.speed] ?? 0;
      const rotationCode = ROTATION_TO_PROTOCOL_CODE[perMessageSettings.rotation] ?? 0;
      const printModeCode = PRINT_MODE_TO_PROTOCOL_CODE[perMessageSettings.printMode] ?? 0;
      commands.push({ command: `^CM s${speedCode};o${rotationCode};p${printModeCode}`, delayAfterMs: 900 });
    }

    // If the message carries ANY stored adjustSettings, treat the full set as
    // authoritative and push every key from fullAdjustSettings (which already
    // merged stored values with fleet defaults). This guarantees Width=2 /
    // Delay=500 / etc. actually reach the printer instead of leaving stale
    // HMI values (e.g. width=15) in place.
    const hasAnyStoredAdjust = !!adjustSettings && Object.keys(adjustSettings).length > 0;
    const pushKey = (key: keyof MessageDetails['adjustSettings'] & keyof PrintSettings) =>
      hasAnyStoredAdjust || adjustSettings?.[key] !== undefined;

    if (pushKey('width')) commands.push({ command: `^PW ${fullAdjustSettings.width}`, delayAfterMs: 1200 });
    if (pushKey('height')) commands.push({ command: `^PH ${fullAdjustSettings.height}`, delayAfterMs: 900 });
    if (pushKey('delay')) commands.push({ command: `^DA ${fullAdjustSettings.delay}`, delayAfterMs: 700 });
    if (pushKey('bold')) commands.push({ command: `^SB ${fullAdjustSettings.bold}`, delayAfterMs: 700 });
    if (pushKey('gap')) commands.push({ command: `^GP ${fullAdjustSettings.gap}`, delayAfterMs: 700 });
    if (pushKey('pitch')) commands.push({ command: `^PA ${fullAdjustSettings.pitch}`, delayAfterMs: 700 });

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
        jetRunning: false,
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
    onSelectionSyncStart: (slaveIds, _messageName) => {
      // A new selection is starting — wipe every slave's prior pass/fail pip so
      // the UI shows a clean slate until each printer reports its own ACK.
      for (const id of slaveIds) {
        updatePrinter(id, { lastSelectionResult: undefined });
      }
    },
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

    // Per-printer lock only. The fleet-wide lock previously wrapped this call
    // was serializing writes across ALL printers — turning a parallel 13-printer
    // message select into a 4.5-minute sequential run. Each printer already has
    // its own exclusive lock (protecting its single port-23 session), and TCP
    // sessions to different printers are fully independent hardware, so
    // concurrent per-printer transactions cannot cause single-printer lockups.
    // The fleet lock is still retained for jet-cycle mass operations elsewhere.
    return runPrinterWriteExclusive(targetPrinter.id, async () => {
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
    });
  }, [connectionState.connectedPrinter?.id, sendCommand, sendCommandToPrinter]);

  // syncMessageToSlaves is declared after replaceMessageWithoutDelete (below)
  // because it depends on that helper.

  const replaceMessageWithoutDelete = useCallback(async (
    targetPrinter: Printer,
    messageName: string,
    details: Pick<MessageDetails, 'fields' | 'templateValue' | 'settings' | 'adjustSettings' | 'advancedSettings'>,
    reselectAfter: boolean = true,
  ) => {
    // Protected messages are safety-net messages on the printer (e.g. a
    // "60DAYBACKUPCODE" that uses the printer's native User Prompt firmware
    // field). CodeSync has no protocol coverage for the User Prompt field
    // type, so rewriting the slot via ^NM would strip it and permanently
    // destroy the operator's offline backup. Refuse the overwrite here — this
    // funnel is used by copy-to-printers, master→slave sync, prompt rewrites
    // and adjust-settings apply, so guarding once covers every path.
    if (isMessageProtected(messageName)) {
      console.warn(`[Protected] Refusing to overwrite "${messageName}" on ${targetPrinter.name} — message is protected`);
      return { success: false as const, reason: 'protected' as const };
    }
    const { perMessageSettings } = buildEffectiveMessageDependentSettings(details as MessageDetails, targetPrinter);
    const rawCommands = await buildMessageCommands(
      messageName,
      details.fields,
      details.templateValue,
      false,
      perMessageSettings,
      details.advancedSettings?.counters,
    );

    if (!rawCommands || rawCommands.length === 0) {
      return { success: true as const, reason: null as 'switch' | 'command' | 'reselect' | 'protected' | null };
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

    // WP-2 — record that this printer has received this message so
    // ApplyToPrintersDialog can pre-check it next time (Squid parity).
    try { recordMessageSent(targetPrinter.id, messageName); } catch {}

    return { success: true as const, reason: null as 'switch' | 'command' | 'reselect' | 'protected' | null };
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
    if (isMessageProtected(messageName)) {
      console.warn(`[MasterSlaveSync] Skipping protected message "${messageName}" — refusing to overwrite slave backup slot`);
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
      // Per-slave Line ID substitution: dynamicSource === 'lineId' fields must
      // be rewritten with each slave's configured lineId so the printer HMI
      // shows the correct line number instead of the master's.
      const slaveOffset = slave.expiryOffsetDays;
      const slaveLineId = slave.lineId?.trim();
      const slaveFields = details.fields.map((f) => {
        let next = f;
        if (slaveOffset !== undefined) {
          const isExpiry = f.autoCodeFieldType?.startsWith('date_expiry')
            || (f.autoCodeExpiryDays ?? 0) > 0;
          if (isExpiry) next = { ...next, autoCodeExpiryDays: slaveOffset };
        }
        if ((f as any).dynamicSource === 'lineId' && slaveLineId) {
          next = { ...next, data: slaveLineId };
        }
        return next;
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

  const getExactStoredMessageForPrinter = useCallback((messageName: string, targetPrinter?: Printer | null): MessageDetails | null => {
    const targetPrinterId = targetPrinter?.id ?? connectionState.connectedPrinter?.id;
    if (targetPrinterId === undefined) return getMessageStrict(messageName);
    return getMessageStrict(messageName, targetPrinterId);
  }, [connectionState.connectedPrinter?.id, getMessageStrict]);

  const getStoredMessageForPrinter = useCallback((messageName: string, targetPrinter?: Printer | null): MessageDetails | null => {
    const candidatePrinterIds = [
      ...(targetPrinter?.id !== undefined ? [targetPrinter.id] : []),
      ...(targetPrinter?.role === 'slave' && targetPrinter.masterId !== undefined ? [targetPrinter.masterId] : []),
      ...(targetPrinter?.role !== 'slave' && targetPrinter?.masterId !== undefined ? [targetPrinter.masterId] : []),
      ...(connectionState.connectedPrinter?.id !== undefined ? [connectionState.connectedPrinter.id] : []),
    ];

    const seen = new Set<number>();
    for (const printerId of candidatePrinterIds) {
      if (seen.has(printerId)) continue;
      seen.add(printerId);

      const stored = getMessageStrict(messageName, printerId);
      if (stored) return stored;
    }

    return targetPrinter?.id !== undefined ? getMessage(messageName, targetPrinter.id) : getMessage(messageName);
  }, [connectionState.connectedPrinter?.id, getMessage, getMessageStrict]);

  const updateSettingsAndPersistCurrentMessageAdjust = useCallback((next: Partial<PrintSettings>) => {
    updateSettings(next);

    const targetPrinter = selectedPrinter ?? connectionState.connectedPrinter ?? null;
    if (!targetPrinter) return;

    const messageName = targetPrinter.id === connectionState.connectedPrinter?.id
      ? (connectionState.status?.currentMessage ?? targetPrinter.currentMessage ?? null)
      : (targetPrinter.currentMessage ?? null);
    if (!messageName) return;

    const stored = getExactStoredMessageForPrinter(messageName, targetPrinter)
      ?? getStoredMessageForPrinter(messageName, targetPrinter);
    if (!stored) return;

    const mergedAdjust: PrintSettings = {
      ...FLEET_DEFAULT_ADJUST_SETTINGS,
      ...(stored.settings ?? {}),
      ...(stored.adjustSettings ?? {}),
      ...next,
      // Rotation remains setup-card driven for fleet consistency. If no setup
      // value exists, keep the edited/stored value as the fallback.
      rotation: targetPrinter.rotation
        ?? next.rotation
        ?? stored.adjustSettings?.rotation
        ?? stored.settings?.rotation
        ?? FLEET_DEFAULT_ADJUST_SETTINGS.rotation,
    };

    saveMessage({
      ...stored,
      adjustSettings: mergedAdjust,
      settings: {
        ...(stored.settings ?? {}),
        printMode: stored.settings?.printMode ?? 'Normal',
        speed: mergedAdjust.speed,
        rotation: mergedAdjust.rotation,
        ...(next.speed !== undefined ? { speed: next.speed } : {}),
      },
    }, targetPrinter.id);
    recentlySavedRef.current.set(`${targetPrinter.id}:${messageName}`, Date.now());
    console.log('[AdjustDebug][dialog.persistCurrentMessage]', {
      printerId: targetPrinter.id,
      printerName: targetPrinter.name,
      messageName,
      next,
      mergedAdjust,
    });
  }, [
    selectedPrinter,
    connectionState.connectedPrinter,
    connectionState.status?.currentMessage,
    updateSettings,
    getExactStoredMessageForPrinter,
    getStoredMessageForPrinter,
    saveMessage,
  ]);

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

  /** Copy a message (full content, template, settings) from a source printer to one or more targets.
   *  Uses replaceMessageWithoutDelete per target so an existing slot is overwritten in place
   *  and a new slot is created via ^NM. Per-target rotation and expiry overrides are respected. */
  const copyMessageToPrinters = useCallback(async (
    sourceCandidate: Printer | null | undefined,
    message: PrintMessage,
    targets: Printer[],
    attempt: number = 1,
  ): Promise<void> => {
    const source = sourceCandidate ?? connectionState.connectedPrinter ?? null;
    if (!source) {
      toast.error('No source printer — connect first');
      return;
    }
    if (targets.length === 0) return;

    // Resolve source details: try cache first, then fetch from source if it's the connected printer.
    let details = getStoredMessageForPrinter(message.name, source);
    if ((!details || details.fields.length === 0)
        && source.id === connectionState.connectedPrinter?.id
        && connectionState.isConnected) {
      try {
        details = await fetchMessageContent(message.name);
      } catch {}
    }
    if (!details || details.fields.length === 0) {
      toast.error(`Could not read "${message.name}" from source printer`);
      return;
    }

    // Skip any target that is offline, is the source itself, or has this
    // message name marked as protected (see src/lib/protectedMessages.ts).
    const protectedTargets = targets.filter(t => isMessageProtected(message.name) && t.id !== source.id);
    const eligible = targets.filter(t => t.id !== source.id && t.isAvailable && !isMessageProtected(message.name));
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      if (protectedTargets.length > 0) {
        toast.error(`"${message.name}" is protected — overwrite refused on all targets`);
      } else {
        toast.error('No eligible target printers (offline or source excluded)');
      }
      return;
    }

    toast.loading(`Copying "${message.name}" to ${eligible.length} printer(s)…`, { id: 'copy-msg' });

    const results = await Promise.all(eligible.map(async (target) => {
      // WP-1 (Per-Printer Settings SOW):
      // Rule 2 — Copy to Printers never overwrites tuned numbers. If the
      // target already has its own copy of this message, keep its stored
      // adjustSettings (W/D/Bold/Gap/Speed) untouched and only refresh the
      // content (fields, text, barcodes).
      // Rule 3 — First-time send seeds from the source printer's numbers.
      // Rule 4 — Rotation always comes from the target's Printer Setup Card.
      const existingTargetStored = getExactStoredMessageForPrinter(message.name, target);
      const preservedTuning = !!existingTargetStored?.adjustSettings;
      const baseAdjust = preservedTuning
        ? { ...(existingTargetStored!.adjustSettings ?? {}) }   // keep tuned numbers
        : { ...(details!.adjustSettings ?? {}) };               // seed from source
      const targetRotation = target.rotation ?? baseAdjust.rotation ?? 'Normal';
      const targetAdjust = { ...baseAdjust, rotation: targetRotation };
      const targetOffset = target.expiryOffsetDays;
      // Per-target Line ID substitution: any field flagged as a printer-driven
      // Line ID (dynamicSource === 'lineId') must be rewritten with THIS
      // printer's configured lineId before we save to the target. Otherwise
      // every copied printer keeps the source printer's Line ID on the HMI.
      const targetLineId = target.lineId?.trim();
      const targetFields = details!.fields.map((f) => {
        let next = f;
        if (targetOffset !== undefined) {
          const isExpiry = f.autoCodeFieldType?.startsWith('date_expiry')
            || (f.autoCodeExpiryDays ?? 0) > 0;
          if (isExpiry) next = { ...next, autoCodeExpiryDays: targetOffset };
        }
        if ((f as any).dynamicSource === 'lineId' && targetLineId) {
          next = { ...next, data: targetLineId };
        }
        return next;
      });

      try {
        const result = await replaceMessageWithoutDelete(target, message.name, {
          fields: targetFields,
          templateValue: details!.templateValue,
          settings: details!.settings,
          adjustSettings: targetAdjust,
          advancedSettings: details!.advancedSettings,
        }, false);
        if (result.success) {
          const targetDetails = normalizeMessageForPrinter({
            ...details!,
            name: message.name,
            fields: targetFields,
            adjustSettings: targetAdjust,
          });
          saveMessage(targetDetails, target.id);
        }
        return { target, ok: result.success, preservedTuning, reason: result.success ? undefined : result.reason };
      } catch (e) {
        console.error(`[CopyMessage] Failed on ${target.name}:`, e);
        return { target, ok: false, preservedTuning, reason: 'exception' };
      }
    }));

    const okCount = results.filter(r => r.ok).length;
    const failCount = results.length - okCount;
    const preservedNames = results
      .filter(r => r.ok && r.preservedTuning)
      .map(r => r.target.name);
    const preservedNote = preservedNames.length > 0
      ? ` Kept existing tuning on ${preservedNames.join(', ')}.`
      : '';
    if (failCount === 0) {
      toast.success(
        (skipped > 0
          ? `Copied to ${okCount} printer(s) (${skipped} skipped: offline/source).`
          : `Copied to ${okCount} printer(s).`) + preservedNote,
        { id: 'copy-msg', duration: preservedNote ? 6000 : 4000 },
      );
      // WP-4: clear any lingering retry dialog once every printer has succeeded.
      setCopyRetryState(null);
    } else {
      const failed = results.filter(r => !r.ok);
      failed.forEach(f => {
        console.error(`[CopyMessage] FAILED on ${f.target.name} (${f.target.ipAddress ?? f.target.id}) — reason: ${f.reason ?? 'unknown'}`);
      });
      // Dismiss the loading toast and hand off to the Retry / Ignore dialog (WP-4).
      toast.dismiss('copy-msg');
      if (okCount > 0) {
        toast.success(`Copied to ${okCount} printer(s).${preservedNote}`, { duration: 3000 });
      }
      setCopyRetryState({
        source,
        message,
        attempt,
        failedTargets: failed.map(f => f.target),
        failures: failed.map(f => ({
          printerName: f.target.name,
          reason: f.reason ?? 'unknown',
        })),
      });
    }

  }, [
    connectionState.connectedPrinter,
    connectionState.isConnected,
    getStoredMessageForPrinter,
    getExactStoredMessageForPrinter,
    fetchMessageContent,
    replaceMessageWithoutDelete,
    normalizeMessageForPrinter,
    saveMessage,
  ]);


  // WP-5: build per-printer rows for the "on other printers" stack view.
  // Read-only visibility panel that lists every printer that has this
  // message stored or has previously received it, along with each
  // printer's tuned adjust settings (W/D/Bold/Gap/Speed) and rotation.
  const buildOtherPrinterRows = useCallback((
    msgName: string,
    focusPrinterId: number | null | undefined,
  ): OtherPrinterRow[] => {
    if (!msgName) return [];
    return printers
      .map((p): OtherPrinterRow | null => {
        const stored = getExactStoredMessageForPrinter(msgName, p);
        const last = getLastSentAt(p.id, msgName);
        if (!stored && !last) return null;
        const adj = stored?.adjustSettings ?? {};
        return {
          printerId: p.id,
          printerName: p.name,
          lineId: p.lineId,
          isCurrent: p.id === focusPrinterId,
          width: (adj as any).width,
          delay: (adj as any).delay,
          bold: (adj as any).bold,
          gap: (adj as any).gap,
          speed: (adj as any).speed,
          rotation: p.rotation ?? (adj as any).rotation,
          lastSentAt: last,
        };
      })
      .filter((r): r is OtherPrinterRow => r !== null)
      .sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (b.isCurrent && !a.isCurrent) return 1;
        return (b.lastSentAt ?? 0) - (a.lastSentAt ?? 0);
      });
  }, [printers, getExactStoredMessageForPrinter]);


  const applyStoredAdjustSettings = useCallback(async (
    targetPrinter: Printer,
    messageName: string,
  ): Promise<void> => {
    const exactStored = getExactStoredMessageForPrinter(messageName, targetPrinter);
    const fallbackStored = exactStored ? null : getStoredMessageForPrinter(messageName, targetPrinter);
    const storedRaw = exactStored ?? fallbackStored;
    // Legacy messages (created before we persisted per-message adjust settings)
    // used to be skipped here, which left the HMI's live values (often W15/D200)
    // untouched after a select. Instead, synthesize a stored record backed by
    // the fleet defaults so every select pushes W2/D500/Ultra Fast unless the
    // message explicitly overrides them.
    const stored: MessageDetails = storedRaw ?? {
      name: messageName,
      fields: [],
      templateValue: undefined,
      settings: { speed: FLEET_DEFAULT_ADJUST_SETTINGS.speed, rotation: FLEET_DEFAULT_ADJUST_SETTINGS.rotation } as MessageDetails['settings'],
      adjustSettings: { ...FLEET_DEFAULT_ADJUST_SETTINGS } as MessageDetails['adjustSettings'],
    } as MessageDetails;
    if (!storedRaw) {
      console.warn('[AdjustDebug][applyStoredAdjustSettings.usingFleetDefaults]', {
        targetPrinterId: targetPrinter.id,
        targetPrinterName: targetPrinter.name,
        messageName,
      });
    } else if (!exactStored) {
      saveMessage({
        ...storedRaw,
        adjustSettings: {
          ...FLEET_DEFAULT_ADJUST_SETTINGS,
          ...(storedRaw.settings ?? {}),
          ...(storedRaw.adjustSettings ?? {}),
          rotation: targetPrinter.rotation
            ?? storedRaw.adjustSettings?.rotation
            ?? storedRaw.settings?.rotation
            ?? FLEET_DEFAULT_ADJUST_SETTINGS.rotation,
        },
      }, targetPrinter.id);
      console.log('[AdjustDebug][applyStoredAdjustSettings.seedExactTarget]', {
        targetPrinterId: targetPrinter.id,
        targetPrinterName: targetPrinter.name,
        messageName,
        seededFromFallback: true,
      });
    }
    const hasStoredMessageSettings = true;

    // Important: do NOT adopt the printer's live values here. At this point we
    // have already switched to the target message, so the live HMI values may
    // be the stale defaults that caused the customer issue. HMI edits are
    // captured before switching away by captureHmiAdjustSilently(); selection
    // must push the stored per-printer values back down and persist them.
    const adj = stored.adjustSettings ?? {};
    const { fullAdjustSettings, perMessageSettings } = buildEffectiveMessageDependentSettings(stored, targetPrinter);
    const adjustToPush: Partial<MessageDetails['adjustSettings']> = { ...(adj as object) };

    const commands = buildMessageDependentCommandSequence({
      adjustSettings: adjustToPush,
      fullAdjustSettings,
      perMessageSettings,
      includeMessageSettings: hasStoredMessageSettings,
      includeMessageSettingsCommand: true,
    });

    if (commands.length > 0) {
      commands.push({ command: '^SV', delayAfterMs: SAVE_FLUSH_IDLE_AFTER_DATA_MS });
    }

    console.log('[AdjustDebug][applyStoredAdjustSettings.start]', {
      targetPrinterId: targetPrinter.id,
      targetPrinterName: targetPrinter.name,
      messageName,
      adjustToPush,
      commands,
    });

    if (commands.length === 0) {
      console.log('[AdjustDebug][applyStoredAdjustSettings.noop]', { targetPrinterId: targetPrinter.id, messageName });
      updateSettings(fullAdjustSettings);
      return;
    }

    if (targetPrinter.id === connectionState.connectedPrinter?.id) {
      setPollingPaused(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await waitForPollingIdle(3000);
        const result = await sendVerifiedCommandSequence(targetPrinter, commands, 300);
        if (!result.success) {
          console.error('[AdjustDebug][applyStoredAdjustSettings.failed]', { targetPrinterId: targetPrinter.id, messageName, result });
          return;
        }
      } finally {
        setPollingPaused(false);
      }
    } else {
      const result = await sendVerifiedCommandSequence(targetPrinter, commands, 300);
      if (!result.success) {
        console.error('[AdjustDebug][applyStoredAdjustSettings.failed]', { targetPrinterId: targetPrinter.id, messageName, result });
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
    getExactStoredMessageForPrinter,
    connectionState.connectedPrinter?.id,
    sendVerifiedCommandSequence,
    updateSettings,
    saveMessage,
  ]);

  // Global "Sync Adjust from Printers" — iterate every online printer, query
  // its current PW/PH/DA/SB/GP/PA + speed/rotation via documented reads, and write those
  // values back into the printer's stored copy of its current message. This
  // lets operators tweak settings on the printer HMI (press Save at the
  // printer) and then bring those changes back into CodeSync in one click so
  // future re-selects don't clobber their tweaks.
  const [isSyncingAdjustFromPrinters, setIsSyncingAdjustFromPrinters] = useState(false);
  const syncAdjustSettingsFromPrinters = useCallback(async (targets?: Printer[]) => {
    const pool = targets ?? printers;
    const online = pool.filter(p => p.isAvailable);
    if (online.length === 0) {
      toast.info('No online printers to sync');
      return;
    }
    setIsSyncingAdjustFromPrinters(true);
    const toastId = targets && targets.length === 1 ? `sync-adjust-${targets[0].id}` : 'sync-adjust-all';
    toast.loading(`Reading adjust settings from ${online.length} printer(s)…`, { id: toastId });

    let updatedCount = 0;
    let noMessageCount = 0;
    let noStoredCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;
    const failureDetails: string[] = [];
    const noStoredDetails: string[] = [];
    const noMessageDetails: string[] = [];

    // Sequential to avoid overwhelming the fleet-write queue and to keep
    // toast/progress deterministic.
    for (const printer of online) {
      try {
        const queried = await queryPrintSettingsForPrinter(printer);
        if (!queried) {
          console.warn('[SyncAdjustFromPrinters] query failed', { printer: printer.name });
          failedCount++;
          failureDetails.push(`${printer.name}: no response to settings query (^PW/^PH/^DA/^SB/^GP/^PA/^SP/^RT)`);
          continue;
        }
        const printerCurrent = queried.settings;

        // If this is the currently-connected printer, mirror the freshly-read
        // values into the live Global Adjust state so the Adjust dialog shows
        // exactly what the printer just reported.
        if (printer.id === connectionState.connectedPrinter?.id) {
          updateSettings(printerCurrent);
        }

        const messageName = queried.currentMessage ?? printer.currentMessage ?? null;
        if (!messageName) {
          console.warn('[SyncAdjustFromPrinters] no current message', { printer: printer.name });
          noMessageCount++;
          noMessageDetails.push(printer.name);
          continue;
        }
        const stored = getStoredMessageForPrinter(messageName, printer);
        if (!stored) {
          console.warn('[SyncAdjustFromPrinters] no stored message', { printer: printer.name, messageName });
          noStoredCount++;
          noStoredDetails.push(`${printer.name}:${messageName}`);
          continue;
        }
        const storedAdjust = (stored.adjustSettings ?? {}) as Partial<PrintSettings>;
        const storedMsgSettings = (stored.settings ?? {}) as Partial<PrintSettings>;
        const mergedAdjust: Partial<PrintSettings> = { ...storedAdjust };
        const mergedMsgSettings: Partial<PrintSettings> = { ...storedMsgSettings };
        let changed = false;
        for (const k of ['width', 'height', 'delay', 'bold', 'gap', 'pitch'] as (keyof PrintSettings)[]) {
          const pv = printerCurrent[k];
          if (pv !== undefined && (pv !== storedAdjust[k] || pv !== storedMsgSettings[k])) {
            (mergedAdjust as Record<string, unknown>)[k] = pv;
            (mergedMsgSettings as Record<string, unknown>)[k] = pv;
            changed = true;
          }
        }
        for (const k of ['speed', 'rotation'] as (keyof PrintSettings)[]) {
          const pv = printerCurrent[k];
          if (pv !== undefined && (pv !== storedMsgSettings[k] || pv !== storedAdjust[k])) {
            (mergedMsgSettings as Record<string, unknown>)[k] = pv;
            (mergedAdjust as Record<string, unknown>)[k] = pv;
            changed = true;
          }
        }
        if (changed) {
          const updated: MessageDetails = {
            ...stored,
            adjustSettings: mergedAdjust as MessageDetails['adjustSettings'],
            settings: mergedMsgSettings as MessageDetails['settings'],
          };
          saveMessage(updated, printer.id);
          updatedCount++;
          console.log('[SyncAdjustFromPrinters] updated', {
            printerId: printer.id,
            printerName: printer.name,
            messageName,
            printerCurrent,
            mergedAdjust,
            mergedMsgSettings,
          });
        } else {
          unchangedCount++;
        }
      } catch (e) {
        console.error(`[SyncAdjustFromPrinters] failed on ${printer.name}:`, e);
        failedCount++;
        const msg = e instanceof Error ? e.message : String(e);
        failureDetails.push(`${printer.name}: ${msg}`);
      }
    }


    setIsSyncingAdjustFromPrinters(false);
    const parts: string[] = [];
    parts.push(`${updatedCount} updated`);
    if (unchangedCount) parts.push(`${unchangedCount} already in sync`);
    if (noMessageCount) parts.push(`${noMessageCount} no active msg`);
    if (noStoredCount) parts.push(`${noStoredCount} msg not stored`);
    if (failedCount) parts.push(`${failedCount} failed`);
    const isSingle = online.length === 1;
    const detailLines: string[] = [];
    if (failureDetails.length) detailLines.push(...failureDetails);
    if (noStoredDetails.length) detailLines.push(`Not stored locally: ${noStoredDetails.join(', ')}`);
    if (noMessageDetails.length) detailLines.push(`No active message: ${noMessageDetails.join(', ')}`);
    const description = detailLines.length ? detailLines.join(' • ') : undefined;
    if (failedCount > 0 || noStoredCount > 0 || noMessageCount > 0) {
      toast.warning(`Adjust sync: ${parts.join(', ')}`, { id: toastId, duration: isSingle ? 10000 : 8000, description });
    } else {
      toast.success(`Adjust sync: ${parts.join(', ')}`, { id: toastId });
    }
  }, [printers, queryPrintSettingsForPrinter, getStoredMessageForPrinter, saveMessage, connectionState.connectedPrinter?.id, updateSettings]);

  // Silent auto-capture — before we ^SM away from the current message, pull
  // any Width/Delay/Bold/Gap/Pitch/Speed/Rotation the operator changed at the
  // printer HMI back into our stored copy of THAT message. Otherwise the next
  // time they re-select it we push stale numbers and clobber the operator's
  // tweak (customer report 2026-07-18: 60-day white width kept reverting from
  // 2 back to 15 after switching messages).
  const captureHmiAdjustSilently = useCallback(async (printer: Printer, messageName: string | null) => {
    if (!messageName) return;
    try {
      const queried = await queryPrintSettingsForPrinter(printer);
      if (!queried) return;
      const printerCurrent = queried.settings;
      const stored = getStoredMessageForPrinter(messageName, printer);
      if (!stored) return;
      const storedAdjust = (stored.adjustSettings ?? {}) as Partial<PrintSettings>;
      const storedMsgSettings = (stored.settings ?? {}) as Partial<PrintSettings>;
      const mergedAdjust: Partial<PrintSettings> = { ...storedAdjust };
      const mergedMsgSettings: Partial<PrintSettings> = { ...storedMsgSettings };
      let changed = false;
      for (const k of ['width', 'height', 'delay', 'bold', 'gap', 'pitch', 'speed', 'rotation'] as (keyof PrintSettings)[]) {
        const pv = printerCurrent[k];
        if (pv !== undefined && (pv !== storedAdjust[k] || pv !== storedMsgSettings[k])) {
          (mergedAdjust as Record<string, unknown>)[k] = pv;
          (mergedMsgSettings as Record<string, unknown>)[k] = pv;
          changed = true;
        }
      }
      if (changed) {
        saveMessage({
          ...stored,
          adjustSettings: mergedAdjust as MessageDetails['adjustSettings'],
          settings: mergedMsgSettings as MessageDetails['settings'],
        }, printer.id);
        console.log('[AutoCaptureHmiAdjust] captured HMI edits before switch', {
          printerId: printer.id,
          printerName: printer.name,
          messageName,
          mergedAdjust,
        });
      }
    } catch (e) {
      console.warn('[AutoCaptureHmiAdjust] failed (non-fatal)', e);
    }
  }, [queryPrintSettingsForPrinter, getStoredMessageForPrinter, saveMessage]);





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

  // End-of-shift: send ^SJ 0 to every online printer that still has its jet
  // running, serialized so no two stop-jet commands share the port-23 window
  // (which was locking printers up when clicked fast one after another).
  const [isStoppingAllJets, setIsStoppingAllJets] = useState(false);
  const handleStopAllJets = useCallback(async () => {
    // Filter targets:
    //   - must be reachable (isAvailable)
    //   - skip printers already in a 'stopping' countdown (avoid duplicate ^SJ 0
    //     which can re-lock a printer mid-shutdown)
    //   - skip any printer whose last-known jetRunning === false (emulator poll
    //     or connected-printer ^SU). Only skip when we KNOW it's off; undefined
    //     means we've never observed the state and we still send.
    const targets = printers.filter(p => {
      if (!p.isAvailable) return false;
      const cd = getCountdown(p.id);
      if (cd.type === 'stopping') return false;
      if (p.jetRunning === false) return false;
      // Belt-and-braces for the connected printer: if live status says jet is
      // off (fresher than the persisted flag), skip it too.
      if (
        connectionState.connectedPrinter?.id === p.id &&
        connectionState.status &&
        connectionState.status.jetRunning === false
      ) {
        return false;
      }
      return true;
    });

    const skipped = printers.filter(p => p.isAvailable).length - targets.length;

    if (targets.length === 0) {
      toast.info(skipped > 0
        ? `All ${skipped} online printer${skipped === 1 ? '' : 's'} already stopped or stopping.`
        : 'No online printers to stop.');
      return;
    }
    setIsStoppingAllJets(true);
    console.log('[StopAllJets] starting', {
      count: targets.length,
      skipped,
      ids: targets.map(p => p.id),
    });
    let ok = 0;
    let fail = 0;
    try {
      for (const printer of targets) {
        try {
          // If this iteration targets the currently-connected printer, arm the
          // polling auto-disconnect grace window so we don't tear the socket
          // down mid-shutdown (Issue 2 recurrence).
          if (connectionState.connectedPrinter?.id === printer.id) {
            armStopJetGrace?.(150);
          }
          const success = await sendCommandToPrinter(printer, '^SJ 0');
          if (success) {
            ok += 1;
            startCountdown(printer.id, 'stopping');
            console.log('[StopAllJets] stopped', { id: printer.id, name: printer.name });
          } else {
            fail += 1;
            console.warn('[StopAllJets] failed', { id: printer.id, name: printer.name });
          }
        } catch (e) {
          fail += 1;
          console.error('[StopAllJets] error', { id: printer.id, name: printer.name, error: e });
        }
        // Safety gap between printers so a laggy ACK never overlaps the next open
        await new Promise(r => setTimeout(r, 400));
      }
      const skipMsg = skipped > 0 ? ` (${skipped} already stopped)` : '';
      if (fail === 0) toast.success(`Stop Jet sent to ${ok} printer${ok === 1 ? '' : 's'}.${skipMsg}`);
      else toast.warning(`Stop Jet: ${ok} succeeded, ${fail} failed.${skipMsg} Check log.`);
    } finally {
      setIsStoppingAllJets(false);
    }
  }, [printers, sendCommandToPrinter, startCountdown, getCountdown, connectionState.connectedPrinter, connectionState.status, armStopJetGrace]);


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

  // Per-printer ^SM select — hoisted so both desktop and mobile MessagesScreen
  // branches can pass it as onSelectOnPrinter. Handles Line ID rewrite,
  // connected vs background-printer socket paths, and ACK/FAIL pip.
  const selectMessageOnAnyPrinter = async (printer: Printer, message: PrintMessage): Promise<boolean> => {
    // Auto-capture HMI edits on the currently-selected message before we
    // switch away — preserves any Width/Delay/Speed the operator tweaked at
    // the printer keypad.
    const currentlyOnPrinter = printer.id === connectionState.connectedPrinter?.id
      ? (connectionState.status?.currentMessage ?? printer.currentMessage ?? null)
      : (printer.currentMessage ?? null);
    if (currentlyOnPrinter && currentlyOnPrinter !== message.name) {
      await captureHmiAdjustSilently(printer, currentlyOnPrinter);
    }
    try {
      const stored = getStoredMessageForPrinter(message.name, printer);

      const targetLineId = printer.lineId?.trim();
      const needsRewrite = !!stored && !!targetLineId && stored.fields.some(
        (f) => (f as any).dynamicSource === 'lineId' && f.data !== targetLineId
      );
      if (needsRewrite && stored) {
        const rewrittenFields = stored.fields.map((f) =>
          (f as any).dynamicSource === 'lineId' && targetLineId
            ? { ...f, data: targetLineId }
            : f
        );
        const result = await replaceMessageWithoutDelete(printer, message.name, {
          fields: rewrittenFields,
          templateValue: stored.templateValue,
          settings: stored.settings,
          adjustSettings: stored.adjustSettings,
          advancedSettings: stored.advancedSettings,
        }, false);
        if (result.success) {
          saveMessage(
            normalizeMessageForPrinter({ ...stored, fields: rewrittenFields }),
            printer.id,
          );
        } else {
          console.warn(`[LineIdSync] Failed to rewrite Line ID on ${printer.name}: ${result.reason}`);
        }
      }
    } catch (e) {
      console.error('[LineIdSync] Rewrite error before ^SM:', e);
    }

    if (printer.id === connectionState.connectedPrinter?.id) {
      const ok = await selectMessage(message);
      if (ok) {
        try { recordMessageSent(printer.id, message.name); } catch {}
        clearAllExpiryOverrides();
        await applyStoredAdjustSettings(printer, message.name);
      }
      return ok;
    }
    const ok = await sendCommandToPrinter(printer, `^SM ${message.name}`);
    if (ok) {
      try { recordMessageSent(printer.id, message.name); } catch {}
      updatePrinter(printer.id, {
        currentMessage: message.name,
        lastSelectionResult: { messageName: message.name, success: true, at: Date.now() },
      });
      clearAllExpiryOverrides();
      await applyStoredAdjustSettings(printer, message.name);
    } else {
      updatePrinter(printer.id, {
        lastSelectionResult: { messageName: message.name, success: false, reason: 'No ACK from printer', at: Date.now() },
      });
    }
    return ok;
  };


  const getRightPanelContent = (): React.ReactNode | undefined => {

    if (isMobile) return undefined;

    const messageTargetPrinter = selectedPrinter ?? connectionState.connectedPrinter ?? null;
    const isConnectedMessageTarget = messageTargetPrinter?.id === connectionState.connectedPrinter?.id;

    if (currentScreen === 'messages') {




      // Siblings = every other online printer the operator can pick as an
      // extra target in the ApplyToPrintersDialog. Exclude the source printer
      // itself; the dialog always shows it as the locked source.
      const siblingPrinters = messageTargetPrinter
        ? printers.filter(p => p.id !== messageTargetPrinter.id && p.isAvailable)
        : [];

      return (
        <MessagesScreen
          messages={getMessagesForPrinter(messageTargetPrinter)}
          currentMessageName={messageTargetPrinter?.currentMessage ?? connectionState.status?.currentMessage ?? null}
          onSelect={async (message) => {
            if (!messageTargetPrinter) return false;
            return selectMessageOnAnyPrinter(messageTargetPrinter, message);
          }}
          sourcePrinter={messageTargetPrinter}
          siblingPrinters={siblingPrinters}
          onSelectOnPrinter={selectMessageOnAnyPrinter}
          onApplyPromptValuesOnPrinter={(printer, message, updatedDetails) =>
            applyPromptValuesToPrinter(printer, message, updatedDetails)
          }
          onCopyMessageToPrinters={(message, targets) => copyMessageToPrinters(messageTargetPrinter, message, targets)}
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
          otherPrinterRows={buildOtherPrinterRows(editingMessage.name, messageTargetPrinter?.id ?? null)}
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
            otherPrinterRows={buildOtherPrinterRows(editingMessage.name, (selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id ?? null)}
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
              return selectMessageOnAnyPrinter(messageTargetPrinter, message);
            }}
            sourcePrinter={selectedPrinter ?? connectionState.connectedPrinter ?? null}
            siblingPrinters={(() => {
              const tp = selectedPrinter ?? connectionState.connectedPrinter ?? null;
              return tp ? printers.filter(p => p.id !== tp.id && p.isAvailable) : [];
            })()}
            onSelectOnPrinter={selectMessageOnAnyPrinter}
            onApplyPromptValuesOnPrinter={(printer, message, updatedDetails) =>
              applyPromptValuesToPrinter(printer, message, updatedDetails)
            }
            onCopyMessageToPrinters={(message, targets) =>
              copyMessageToPrinters(selectedPrinter ?? connectionState.connectedPrinter ?? null, message, targets)
            }
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
        onSyncAdjustFromPrinters={() => syncAdjustSettingsFromPrinters()}
        onSyncAdjustFromPrinter={(printer) => syncAdjustSettingsFromPrinters([printer])}
        isSyncingAdjustFromPrinters={isSyncingAdjustFromPrinters}
        onStopAllJets={handleStopAllJets}
        isStoppingAllJets={isStoppingAllJets}
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
        onUpdate={updateSettingsAndPersistCurrentMessageAdjust}
        onSendCommand={sendCommand}
        isConnected={connectionState.isConnected}
        title="Adjust Settings (Global)"
        onRefreshFromPrinter={queryPrintSettings}
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

      {/* WP-4: Retry / Ignore dialog for failed Copy-to-Printers pushes */}
      <RetryFailuresDialog
        open={!!copyRetryState}
        messageName={copyRetryState?.message.name ?? ''}
        action="copy"
        failures={copyRetryState?.failures ?? []}
        attempt={copyRetryState?.attempt ?? 1}
        onIgnore={() => setCopyRetryState(null)}
        onRetry={() => {
          if (!copyRetryState) return;
          const { source, message, failedTargets, attempt } = copyRetryState;
          setCopyRetryState(null);
          void copyMessageToPrinters(source, message, failedTargets, attempt + 1);
        }}
      />

    </div>
  );
};

export default Index;
