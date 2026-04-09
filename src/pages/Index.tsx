import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CountdownType } from '@/hooks/useJetCountdown';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { NavItem } from '@/components/layout/BottomNav';
import { Dashboard } from '@/components/screens/Dashboard';
import { PrintersScreen } from '@/components/screens/PrintersScreen';
import { MessagesScreen } from '@/components/screens/MessagesScreen';
import { EditMessageScreen, MessageDetails } from '@/components/screens/EditMessageScreen';
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
import { RecordingOverlay } from '@/components/dev/RecordingOverlay';
import { useScreenRecorder } from '@/hooks/useScreenRecorder';
import { useLicense } from '@/contexts/LicenseContext';
import { PrintMessage } from '@/types/printer';
import { useMasterSlaveSync } from '@/hooks/useMasterSlaveSync';
import { useProductionStorage } from '@/hooks/useProductionStorage';
import { logConsumption } from '@/lib/consumptionTracker';
import { useFleetTelemetryPush } from '@/hooks/useFleetTelemetryPush';


// Dev panel can be shown in dev mode OR when signed in with CITEC password

type ScreenType = NavItem | 'network' | 'control' | 'editMessage' | 'consumables' | 'reports' | 'datasource' | 'wirecable' | 'training';

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
  const { saveMessage, getMessage, deleteMessage: deleteStoredMessage, setPrinterId: setStoragePrinterId } = useMessageStorage();
  
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

  // Clear per-printer expiry overrides when the selected message changes.
  // The printer card should always default to the message's autoCodeExpiryDays;
  // per-printer overrides are only meaningful while the same message is active.
  const prevMessageRef = useRef<string | null>(null);
  useEffect(() => {
    const currentMsg = connectionState.status?.currentMessage ?? null;
    if (prevMessageRef.current !== null && currentMsg !== null && currentMsg !== prevMessageRef.current) {
      // Message changed — clear expiryOffsetDays on all printers
      printers.forEach(p => {
        if (p.expiryOffsetDays != null) {
          updatePrinter(p.id, { expiryOffsetDays: undefined });
        }
      });
    }
    prevMessageRef.current = currentMsg;
  }, [connectionState.status?.currentMessage]);
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
        const hasExpiryOffset = (field.autoCodeExpiryDays ?? 0) > 0;
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

  // Merge autoCode metadata (expiryDays, fieldType, format) from a cached
  // message into a freshly-fetched one. The printer's ^LF response doesn't
  // include this metadata, so we preserve it from the locally stored version.
  const mergeAutoCodeMeta = useCallback((fetched: MessageDetails, cached: MessageDetails | null): MessageDetails => {
    if (!cached) return fetched;
    const cachedIdsAreCanonical = cached.fields.every((field, index) => field.id === index + 1);
    const fetchedIdsAreCanonical = fetched.fields.every((field, index) => field.id === index + 1);
    const allowExactIdMatch = cachedIdsAreCanonical
      && fetchedIdsAreCanonical
      && cached.fields.length === fetched.fields.length;
    const usedCachedIndexes = new Set<number>();
    const merged = { ...fetched, fields: fetched.fields.map((f, i) => {
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
      // Skip if we already have content in localStorage
      if (getMessage(name)) return false;
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
            const merged = mergeAutoCodeMeta(details, cached);
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
    const savedAt = recentlySavedRef.current.get(currentMessageName);
    if (savedAt && Date.now() - savedAt < 30_000) {
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
          const merged = mergeAutoCodeMeta(fetched, cached);
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
  });

  // After saving a message on the master, duplicate the full content to all slaves
  const syncMessageToSlaves = useCallback(async (
    messageName: string,
    details: MessageDetails,
    isNew?: boolean,
  ) => {
    if (!isMaster || !connectionState.connectedPrinter) return;
    const slaves = getSlavesForMaster(connectionState.connectedPrinter.id);
    const availableSlaves = slaves.filter(s => s.isAvailable);
    if (availableSlaves.length === 0) return;

    const commands = await buildMessageCommands(
      messageName,
      details.fields,
      details.templateValue,
      isNew,
    );
    if (!commands || commands.length === 0) return;

    console.log(`[MasterSlaveSync] Pushing message "${messageName}" content to ${availableSlaves.length} slave(s)`);
    for (const slave of availableSlaves) {
      let allOk = true;
      for (const cmd of commands) {
        const ok = await sendCommandToPrinter(slave, cmd);
        if (!ok) {
          allOk = false;
          console.warn(`[MasterSlaveSync] Command failed on ${slave.name}: ${cmd.substring(0, 40)}...`);
        }
      }
      // Also select the message on the slave
      await sendCommandToPrinter(slave, `^SM ${messageName}`);
      // Reset the slave's per-printer expiry override since the master's
      // default expiry is now stored on the printer again
      if (slave.expiryOffsetDays != null) {
        updatePrinter(slave.id, { expiryOffsetDays: undefined });
      }
      console.log(`[MasterSlaveSync] Message "${messageName}" → ${slave.name}: ${allOk ? 'OK' : 'PARTIAL'}`);
    }
  }, [isMaster, connectionState.connectedPrinter, getSlavesForMaster, buildMessageCommands, sendCommandToPrinter, updatePrinter]);

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
  }, [printers, consumableStorage]);

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
  }, [consumableStorage.consumables, consumableStorage]);

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
  }, [sendCommand, connectionState.status?.currentMessage, getMessage, saveMessage, connectedPrinterId]);


  const getRightPanelContent = (): React.ReactNode | undefined => {
    if (isMobile) return undefined;

    const messageTargetPrinter = selectedPrinter ?? connectionState.connectedPrinter ?? null;
    const isConnectedMessageTarget = messageTargetPrinter?.id === connectionState.connectedPrinter?.id;

    if (currentScreen === 'messages') {
      return (
        <MessagesScreen
          messages={connectionState.messages}
          currentMessageName={messageTargetPrinter?.currentMessage ?? connectionState.status?.currentMessage ?? null}
          onSelect={async (message) => {
            if (!messageTargetPrinter) return false;
            // Slaves follow the master's selection — block independent message changes
            if (messageTargetPrinter.role === 'slave') {
              setSlaveBlockPrinterName(messageTargetPrinter.name);
              setSlaveBlockDialogOpen(true);
              return false;
            }
            if (isConnectedMessageTarget) return await selectMessage(message);
            const ok = await sendCommandToPrinter(messageTargetPrinter, `^SM ${message.name}`);
            if (ok) {
              updatePrinter(messageTargetPrinter.id, { currentMessage: message.name });
            }
            return ok;
          }}
          onFetchMessageDetails={isConnectedMessageTarget ? fetchMessageContent : undefined}
          onSendCommand={isConnectedMessageTarget ? async (cmd) => sendCommand(cmd) : undefined}
          onGetStoredMessage={getMessage}
          onSaveMessageContent={isConnectedMessageTarget ? saveMessageContent : undefined}
          onSaveStoredMessage={(details) => saveMessage(normalizeMessageForPrinter(details))}
          connectedPrinterLineId={messageTargetPrinter?.lineId}
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
            deleteStoredMessage(message.name);
          }}
          onHome={() => setCurrentScreen('home')}
          openNewDialogOnMount={openNewDialogOnMount}
          onNewDialogOpened={() => setOpenNewDialogOnMount(false)}
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
          onSave={async (details: MessageDetails, isNew?: boolean): Promise<MessageDetails | null> => {
            const targetName = isNew ? details.name : editingMessage.name;
            const localDetails = normalizeMessageForPrinter({
              ...details,
              name: targetName,
            });
            const success = await saveMessageContent(
              targetName,
              localDetails.fields,
              localDetails.templateValue,
              isNew,
            );
            if (!success) {
              const reason = (saveMessageContent as any).__lastError || '';
              console.error('Failed to save message on printer:', reason);
              toast.error(`Printer rejected message save: ${reason || 'Check settings and try again.'}`);
              return null;
            }
            if (!isNew) {
              updateMessage(editingMessage.id, details.name);
            }
            saveMessage(localDetails);
            // Mark as recently saved so auto-sync won't overwrite with printer version
            recentlySavedRef.current.set(targetName, Date.now());
            syncedMessagesRef.current.add(targetName);
            // Sync full message content to slaves if this is a master
            syncMessageToSlaves(targetName, localDetails, isNew);
            // Reload from printer to get actual field positions
            if (connectionState.isConnected) {
              try {
                const refreshed = await Promise.race([
                  fetchMessageContent(targetName),
                  new Promise<null>(r => setTimeout(() => r(null), 5000)),
                ]);
                if (refreshed && refreshed.fields.length > 0) {
                  const merged = mergeAutoCodeMeta(refreshed, localDetails);
                  saveMessage(merged);
                  // After saving a new message, re-select the previously active message
                  // so the new message is only stored, not auto-selected for printing
                  if (isNew) {
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
            }
            // After saving a new message without refresh, still re-select previous message
            if (isNew && connectionState.isConnected) {
              const prevMessage = connectionState.status?.currentMessage;
              if (prevMessage && prevMessage !== targetName) {
                try {
                  await sendCommand(`^SM ${prevMessage}`);
                } catch (e) {
                  console.error('[onSave] Failed to re-select previous message:', e);
                }
              }
            }
            return null;
          }}
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
                  const merged = mergeAutoCodeMeta(fetched, getMessage(name) ?? null);
                  saveMessage(merged);
                  return merged;
                }
              } catch (e) {
                console.error('[onGetMessageDetails] fetch failed:', e);
              }
            }
            // Fallback to local storage
            return getMessage(name);
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
            printerExpiryOffsetDays={connectionState.connectedPrinter
              ? (printers.find(p => p.id === connectionState.connectedPrinter?.id)?.expiryOffsetDays
                  ?? connectionState.connectedPrinter.expiryOffsetDays)
              : undefined}
            selectedPrinterLineId={connectionState.connectedPrinter ? printers.find(p => p.id === connectionState.connectedPrinter!.id)?.lineId : undefined}
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
          onSave={async (details: MessageDetails, isNew?: boolean): Promise<MessageDetails | null> => {
              const targetName = isNew ? details.name : editingMessage.name;
              const localDetails = normalizeMessageForPrinter({
                ...details,
                name: targetName,
              });
              const success = await saveMessageContent(
                targetName,
                localDetails.fields,
                localDetails.templateValue,
                isNew,
              );
              if (!success) {
                const reason = (saveMessageContent as any).__lastError || '';
                console.error('Failed to save message on printer:', reason);
                toast.error(`Printer rejected message save: ${reason || 'Check settings and try again.'}`);
                return null;
              }
              if (!isNew) {
                updateMessage(editingMessage.id, details.name);
              }
              saveMessage(localDetails);
              recentlySavedRef.current.set(targetName, Date.now());
              syncedMessagesRef.current.add(targetName);
              // Sync full message content to slaves if this is a master
              syncMessageToSlaves(targetName, localDetails, isNew);
              // Reload from printer to get actual field positions
              if (connectionState.isConnected) {
                try {
                  const refreshed = await Promise.race([
                    fetchMessageContent(targetName),
                    new Promise<null>(r => setTimeout(() => r(null), 5000)),
                  ]);
                  if (refreshed && refreshed.fields.length > 0) {
                    const merged = mergeAutoCodeMeta(refreshed, localDetails);
                    saveMessage(merged);
                    if (isNew) {
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
              }
              if (isNew && connectionState.isConnected) {
                const prevMessage = connectionState.status?.currentMessage;
                if (prevMessage && prevMessage !== targetName) {
                  try {
                    await sendCommand(`^SM ${prevMessage}`);
                  } catch (e) {
                    console.error('[onSave] Failed to re-select previous message:', e);
                  }
                }
              }
              return null;
            }}
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
                    const merged = mergeAutoCodeMeta(fetched, getMessage(name) ?? null);
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
            messages={connectionState.messages}
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
              if (messageTargetPrinter.id === connectionState.connectedPrinter?.id) return await selectMessage(message);
              const ok = await sendCommandToPrinter(messageTargetPrinter, `^SM ${message.name}`);
              if (ok) {
                updatePrinter(messageTargetPrinter.id, { currentMessage: message.name });
              }
              return ok;
            }}
            onFetchMessageDetails={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id === connectionState.connectedPrinter?.id ? fetchMessageContent : undefined}
            onSendCommand={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id === connectionState.connectedPrinter?.id ? async (cmd) => sendCommand(cmd) : undefined}
            onGetStoredMessage={getMessage}
            onSaveMessageContent={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.id === connectionState.connectedPrinter?.id ? saveMessageContent : undefined}
            onSaveStoredMessage={(details) => saveMessage(normalizeMessageForPrinter(details))}
            connectedPrinterLineId={(selectedPrinter ?? connectionState.connectedPrinter ?? null)?.lineId}
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
              deleteStoredMessage(message.name);
            }}
            onHome={() => setCurrentScreen('control')}
            openNewDialogOnMount={openNewDialogOnMount}
            onNewDialogOpened={() => setOpenNewDialogOnMount(false)}
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
          <TrainingVideosScreen onBack={handleHome} />
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
        onUpdatePrinter={updatePrinter}
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
        onSyncMaster={syncMaster}
        onBroadcastMessage={broadcastMessage}
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
        onSlaveExpiryChange={async (printerId, days) => {
          // Get the current message details from storage
          const currentMsg = connectionState.status?.currentMessage;
          if (!currentMsg) {
            toast.info('No message currently selected');
            return;
          }
          const stored = getMessage(currentMsg);
          if (!stored || stored.fields.length === 0) {
            toast.info('No message fields to update');
            return;
          }

          // Check if there are any autoCode expiry fields to update
          const hasExpiryFields = stored.fields.some(f => f.autoCodeExpiryDays != null && f.autoCodeExpiryDays > 0);
          
          // Find the target printer
          const targetPrinter = printers.find(p => p.id === printerId);
          if (!targetPrinter) return;

          if (!hasExpiryFields) {
            // No expiry fields — just save the offset setting, no need to resend
            toast.success(`${targetPrinter.name}: expiry offset saved (${days} days)`);
            return;
          }

          // Clone fields with the updated expiry days
          const updatedFields = stored.fields.map(f => {
            if (f.autoCodeExpiryDays != null && f.autoCodeExpiryDays > 0) {
              return { ...f, autoCodeExpiryDays: days };
            }
            return f;
          });

          // Build the protocol commands
          const commands = await buildMessageCommands(currentMsg, updatedFields, stored.templateValue, false);
          if (!commands || commands.length === 0) {
            toast.success(`${targetPrinter.name}: expiry offset saved (${days} days)`);
            return;
          }

          console.log(`[ExpiryChange] Resending "${currentMsg}" to ${targetPrinter.name} with ${days}-day expiry, ${commands.length} commands`);
          toast.loading(`Updating expiry on ${targetPrinter.name}...`, { id: 'printer-expiry' });

          try {
            let anyFailed = false;
            for (const cmd of commands) {
              const ok = await sendCommandToPrinter(targetPrinter, cmd);
              if (!ok) {
                console.warn(`[ExpiryChange] Command failed: ${cmd.substring(0, 30)}...`);
                // ^DM failures are expected (message may not exist yet), skip them
                if (!cmd.startsWith('^DM')) anyFailed = true;
              }
            }
            // Re-select the message on the printer
            await sendCommandToPrinter(targetPrinter, `^SM ${currentMsg}`);
            
            if (anyFailed) {
              toast.warning(`${targetPrinter.name}: expiry updated but some commands failed`, { id: 'printer-expiry' });
            } else {
              toast.success(`${targetPrinter.name}: expiry set to ${days} days`, { id: 'printer-expiry' });
            }
          } catch (e) {
            console.error('[ExpiryChange] Failed:', e);
            toast.error(`Failed to update ${targetPrinter.name}`, { id: 'printer-expiry' });
          }
        }}
        onResetGroupExpiry={async (masterId) => {
          const currentMsg = connectionState.status?.currentMessage;
          if (!currentMsg) return;
          const stored = getMessage(currentMsg);
          if (!stored || stored.fields.length === 0) return;

          // Clear expiry overrides on master and all its slaves
          const master = printers.find(p => p.id === masterId);
          if (!master) return;
          if (master.expiryOffsetDays != null) {
            updatePrinter(master.id, { expiryOffsetDays: undefined });
          }
          const slaves = getSlavesForMaster(masterId).filter(s => s.isAvailable);
          slaves.forEach(s => {
            if (s.expiryOffsetDays != null) {
              updatePrinter(s.id, { expiryOffsetDays: undefined });
            }
          });

          // Re-sync the original message (with master's default expiry) to all slaves
          const allTargets = [master, ...slaves];
          toast.loading('Resetting group expiry...', { id: 'reset-expiry' });
          try {
            const commands = await buildMessageCommands(currentMsg, stored.fields, stored.templateValue, false);
            if (commands && commands.length > 0) {
              for (const target of allTargets) {
                let anyFailed = false;
                for (const cmd of commands) {
                  const ok = await sendCommandToPrinter(target, cmd);
                  if (!ok && !cmd.startsWith('^DM')) anyFailed = true;
                }
                await sendCommandToPrinter(target, `^SM ${currentMsg}`);
                if (anyFailed) {
                  console.warn(`[ResetGroupExpiry] Some commands failed on ${target.name}`);
                }
              }
            }
            const maxExpiry = stored.fields.reduce((max, f) => 
              (f.autoCodeExpiryDays != null && f.autoCodeExpiryDays > max) ? f.autoCodeExpiryDays : max, 0);
            toast.success(`Group expiry reset to ${maxExpiry} days`, { id: 'reset-expiry' });
          } catch (e) {
            console.error('[ResetGroupExpiry] Failed:', e);
            toast.error('Failed to reset group expiry', { id: 'reset-expiry' });
          }
        }}
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
      
      {/* Dev Portal Sign In Dialog */}
      <SignInDialog
        open={devSignInDialogOpen}
        onOpenChange={setDevSignInDialogOpen}
        onSignIn={async (password) => {
          try {
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-dev-access`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
                body: JSON.stringify({ password }),
              }
            );
            const data = await res.json();
            if (data.valid) {
              setIsDevSignedIn(true);
              return true;
            }
            return false;
          } catch {
            return false;
          }
        }}
        title="Dev Portal Sign In"
        description="Enter the developer password to access the Dev Portal"
      />
      
      {/* Adjust Dialog */}
      <AdjustDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        settings={connectionState.settings}
        onUpdate={updateSettings}
        onSendCommand={sendCommand}
        isConnected={connectionState.isConnected}
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
        onAcknowledge={() => sendCommand('^CA')}
      />

      {/* Mobile companion: pause/resume polling FAB */}
      <PausePollingButton />

      {/* Slave message selection block dialog */}
      <AlertDialog open={slaveBlockDialogOpen} onOpenChange={setSlaveBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slave Printer</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              <strong>{slaveBlockPrinterName}</strong> is a slave printer and automatically follows the master's message selection.
              <br /><br />
              To select a different message on this printer, remove it from the sync group first by editing the printer and setting its role to <strong>Standalone</strong>.
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
