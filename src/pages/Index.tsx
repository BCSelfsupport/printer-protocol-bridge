import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CountdownType } from '@/hooks/useJetCountdown';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { LicenseActivationDialog } from '@/components/license/LicenseActivationDialog';

import { SignInDialog } from '@/components/printers/SignInDialog';
import { HelpDialog } from '@/components/help/HelpDialog';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';
import { useJetCountdown } from '@/hooks/useJetCountdown';
import { useMessageStorage, isReadOnlyMessage } from '@/hooks/useMessageStorage';
import { useConsumableStorage } from '@/hooks/useConsumableStorage';
import { DevPanel } from '@/components/dev/DevPanel';
import { useLicense } from '@/contexts/LicenseContext';
import { PrintMessage } from '@/types/printer';
import { useMasterSlaveSync } from '@/hooks/useMasterSlaveSync';
import { useProductionStorage } from '@/hooks/useProductionStorage';
import { logConsumption } from '@/lib/consumptionTracker';


// Dev panel can be shown in dev mode OR when signed in with CITEC password

type ScreenType = NavItem | 'network' | 'control' | 'editMessage' | 'consumables' | 'reports' | 'datasource';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devPanelTab, setDevPanelTab] = useState<string | undefined>(undefined);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isDevSignedIn, setIsDevSignedIn] = useState(false);
  const [devSignInDialogOpen, setDevSignInDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PrintMessage | null>(null);
  // Control whether to auto-open the new message dialog
  const [openNewDialogOnMount, setOpenNewDialogOnMount] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [relayDialogOpen, setRelayDialogOpen] = useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  
  // Local message storage (persists to localStorage)
  const { saveMessage, getMessage, deleteMessage: deleteStoredMessage } = useMessageStorage();
  
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
  } = usePrinterConnection();
  
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
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
  const { isMaster, slaveCount, syncAllMessages, syncMaster } = useMasterSlaveSync({
    printers,
    connectedPrinterId: connectionState.connectedPrinter?.id,
    currentMessage: connectionState.status?.currentMessage,
    messages: connectionState.messages,
  });

  // Low-stock alerts: auto-deduct and show popup when printer signals LOW/EMPTY
  // Delay alerts on startup so update notification can appear first
  const [lowStockAlertQueue, setLowStockAlertQueue] = useState<LowStockAlertData[]>([]);
  const alertedConsumablesRef = useRef<Set<string>>(new Set());
  const startupReadyRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { startupReadyRef.current = true; }, 5000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!startupReadyRef.current) return;
    printers.forEach(printer => {
      if (!printer.isAvailable) return;
      const linked = consumableStorage.getConsumablesForPrinter(printer.id);
      
      const checkAndDeduct = (level: string | undefined, consumable: ReturnType<typeof consumableStorage.getConsumablesForPrinter>['ink'], label: 'Ink' | 'Makeup') => {
        if (!consumable || !level) return;
        if (level !== 'LOW' && level !== 'EMPTY') return;
        
        const alertKey = `${printer.id}-${consumable.id}-${level}`;
        if (alertedConsumablesRef.current.has(alertKey)) return;
        alertedConsumablesRef.current.add(alertKey);
        
        // Auto-deduct 1 unit
        let deducted = false;
        if (consumable.currentStock > 0) {
          consumableStorage.adjustStock(consumable.id, -1);
          deducted = true;
          // Log consumption event for burn-rate predictions
          logConsumption({
            consumableId: consumable.id,
            printerId: printer.id,
            type: label === 'Ink' ? 'ink' : 'makeup',
            qty: 1,
          });
        }
        
        // Queue a popup alert with updated stock info
        const updatedStock = deducted ? consumable.currentStock - 1 : consumable.currentStock;
        setLowStockAlertQueue(prev => [...prev, {
          printerName: printer.name,
          label,
          level: level as 'LOW' | 'EMPTY',
          consumable: { ...consumable, currentStock: updatedStock },
          deducted,
        }]);
      };
      
      checkAndDeduct(printer.inkLevel, linked.ink, 'Ink');
      checkAndDeduct(printer.makeupLevel, linked.makeup, 'Makeup');
    });
  }, [printers, consumableStorage]);

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

      // Check if current message has a linked data source
      const currentMsg = connectionState.status?.currentMessage;
      if (!currentMsg) return;

      const { data: job } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('message_name', currentMsg)
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

      const fieldMappings = job.field_mappings as Record<string, string>;
      const rowValues = nextRow.values as Record<string, string>;

      const updatedFields = storedMessage.fields.map((f, idx) => {
        const fieldNum = idx + 1;
        const mappedCol = Object.entries(fieldMappings).find(
          ([, fIdx]) => parseInt(fIdx as string) === fieldNum
        );
        if (mappedCol) {
          return { ...f, data: String(rowValues[mappedCol[0]] ?? f.data) };
        }
        return f;
      });

      saveMessage({ ...storedMessage, fields: updatedFields });
    } catch (e) {
      toast.error('Force Print failed');
      console.error('[handleForcePrint]', e);
    }
  }, [sendCommand, connectionState.status?.currentMessage, getMessage, saveMessage]);


  const getRightPanelContent = (): React.ReactNode | undefined => {
    if (isMobile) return undefined;
    
    if (currentScreen === 'messages') {
      return (
        <MessagesScreen
          messages={connectionState.messages}
          currentMessageName={connectionState.status?.currentMessage ?? null}
          onSelect={async (message) => {
            const success = await selectMessage(message);
            if (success) {
              setCurrentScreen('home');
            }
            return success;
          }}
          onEdit={(message) => {
            setEditingMessage(message);
            setCurrentScreen('editMessage');
          }}
          onNew={(name: string) => {
            addMessage(name);
            const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
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
          messageName={editingMessage.name}
          printerTime={connectionState.status?.printerTime}
          customCounters={connectionState.status?.customCounters}
          connectedPrinterId={connectionState.connectedPrinter?.id ?? null}
          isConnected={connectionState.isConnected}
          onSave={async (details: MessageDetails, isNew?: boolean) => {
            const targetName = isNew ? details.name : editingMessage.name;
            const success = await saveMessageContent(
              targetName,
              details.fields,
              details.templateValue,
              isNew,
            );
            if (!success) {
              console.error('Failed to save message on printer');
            }
            if (!isNew) {
              updateMessage(editingMessage.id, details.name);
            }
            saveMessage({
              ...details,
              name: targetName,
            });
            setCurrentScreen('messages');
            setEditingMessage(null);
          }}
          onCancel={() => {
            setCurrentScreen('messages');
            setEditingMessage(null);
          }}
          onGetMessageDetails={async (name: string) => {
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
        // Get the current message content from local storage
        const currentMsgName = connectionState.status?.currentMessage;
        const currentMsgContent = currentMsgName ? getMessage(currentMsgName) : undefined;
        
        return (
          <Dashboard
            status={connectionState.status}
            isConnected={connectionState.isConnected}
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
            onMount={() => setControlScreenOpen(true)}
            onUnmount={() => setControlScreenOpen(false)}
            countdownSeconds={countdownSeconds}
            countdownType={countdownType}
            messageContent={currentMsgContent}
            onNavigate={handleNavigate}
            onTurnOff={handleTurnOff}
            onHome={handleHome}
            selectedPrinterId={connectionState.connectedPrinter?.id}
            streamHours={connectionState.metrics?.streamHours}
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
            messageName={editingMessage.name}
            printerTime={connectionState.status?.printerTime}
            customCounters={connectionState.status?.customCounters}
            connectedPrinterId={connectionState.connectedPrinter?.id ?? null}
            isConnected={connectionState.isConnected}
            onSave={async (details: MessageDetails, isNew?: boolean) => {
              const targetName = isNew ? details.name : editingMessage.name;
              const success = await saveMessageContent(
                targetName,
                details.fields,
                details.templateValue,
                isNew,
              );
              if (!success) {
                console.error('Failed to save message on printer');
              }
              if (!isNew) {
                updateMessage(editingMessage.id, details.name);
              }
              saveMessage({
                ...details,
                name: targetName,
              });
              setCurrentScreen('messages');
              setEditingMessage(null);
            }}
            onCancel={() => {
              setCurrentScreen('messages');
              setEditingMessage(null);
            }}
            onGetMessageDetails={async (name: string) => {
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
            currentMessageName={connectionState.status?.currentMessage ?? null}
            onSelect={async (message) => {
              const success = await selectMessage(message);
              if (success) {
                setCurrentScreen('control');
              }
              return success;
            }}
            onEdit={(message) => {
              setEditingMessage(message);
              setCurrentScreen('editMessage');
            }}
            onNew={(name: string) => {
              addMessage(name);
              const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
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
      case 'clean':
        return <CleanScreen onHome={handleHome} />;
      case 'setup':
        // Now handled as dialog
        break;
      case 'service':
        // Now handled as dialog
        break;
      case 'consumables':
        return (
          <ConsumablesScreen
            reorderConfig={consumableStorage.reorderConfig}
            onUpdateReorderConfig={consumableStorage.updateReorderConfig}
            consumables={consumableStorage.consumables}
            assignments={consumableStorage.assignments}
            printers={printers}
            metricsMap={connectionState.connectedPrinter && connectionState.metrics
              ? { [connectionState.connectedPrinter.id]: connectionState.metrics }
              : {}
            }
            onAddConsumable={consumableStorage.addConsumable}
            onUpdateConsumable={consumableStorage.updateConsumable}
            onRemoveConsumable={consumableStorage.removeConsumable}
            onSetStock={consumableStorage.setStock}
            onAdjustStock={consumableStorage.adjustStock}
            onAssignConsumable={consumableStorage.assignConsumable}
            onHome={handleHome}
          />
        );
      case 'reports':
        return (
          <ReportsScreen
            runs={productionStorage.runs}
            snapshots={productionStorage.snapshots}
            printers={printers}
            onAddRun={productionStorage.addRun}
            onUpdateRun={productionStorage.updateRun}
            onDeleteRun={productionStorage.deleteRun}
            onAddDowntime={productionStorage.addDowntimeEvent}
            onEndDowntime={productionStorage.endDowntimeEvent}
            onHome={handleHome}
          />
        );
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
    }
    
    // Default / home / desktop messages+editMessage: render PrintersScreen
    const homeMsgName = connectionState.status?.currentMessage;
    const homeMsgContent = homeMsgName ? getMessage(homeMsgName) : undefined;
    
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
        messageContent={homeMsgContent}
        onControlMount={() => setControlScreenOpen(true)}
        onControlUnmount={() => setControlScreenOpen(false)}
        onNavigate={handleNavigate}
        onTurnOff={handleTurnOff}
        onSyncMaster={syncMaster}
        rightPanelContent={getRightPanelContent()}
        getCountdown={getCountdown}
        onConsumables={() => setCurrentScreen('consumables')}
        onReports={() => setCurrentScreen('reports')}
        lowStockCount={consumableStorage.getLowStockConsumables().length}
        connectedMetrics={connectionState.metrics}
        onLicense={() => setLicenseDialogOpen(true)}
        onRefreshNetwork={checkPrinterStatus}
        isCheckingNetwork={isChecking}
      />
    );
  };

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
      />

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
          defaultTab={devPanelTab}
          showToggleButton={isDevSignedIn}
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
    </div>
  );
};

export default Index;
