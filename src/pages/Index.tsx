import { useState, useCallback } from 'react';
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

import { SignInDialog } from '@/components/printers/SignInDialog';
import { HelpDialog } from '@/components/help/HelpDialog';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';
import { useJetCountdown } from '@/hooks/useJetCountdown';
import { useMessageStorage, isReadOnlyMessage } from '@/hooks/useMessageStorage';
import { DevPanel } from '@/components/dev/DevPanel';
import { PrintMessage } from '@/types/printer';
import { useMasterSlaveSync } from '@/hooks/useMasterSlaveSync';

// Dev panel can be shown in dev mode OR when signed in with CITEC password

type ScreenType = NavItem | 'network' | 'control' | 'editMessage';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isDevSignedIn, setIsDevSignedIn] = useState(false);
  const [devSignInDialogOpen, setDevSignInDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PrintMessage | null>(null);
  // Control whether to auto-open the new message dialog
  const [openNewDialogOnMount, setOpenNewDialogOnMount] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  
  // Local message storage (persists to localStorage)
  const { saveMessage, getMessage, deleteMessage: deleteStoredMessage } = useMessageStorage();
  
  const {
    printers,
    connectionState,
    connect,
    disconnect,
    startPrint,
    stopPrint,
    jetStop,
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
  } = usePrinterConnection();
  
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
  const { countdownSeconds, countdownType, startCountdown, cancelCountdown, getCountdown } = useJetCountdown(connectedPrinterId);

  // Master/Slave sync: auto-syncs messages and selections from master to slaves
  const { isMaster, slaveCount, syncAllMessages, syncMaster } = useMasterSlaveSync({
    printers,
    connectedPrinterId: connectionState.connectedPrinter?.id,
    currentMessage: connectionState.status?.currentMessage,
    messages: connectionState.messages,
  });

  const handleNavigate = (item: NavItem) => {
    // Adjust opens as a dialog, not a screen
    if (item === 'adjust') {
      setAdjustDialogOpen(true);
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
    startPrint();
    if (connectedPrinterId) startCountdown(connectedPrinterId, 'starting', 106);
  }, [startPrint, startCountdown, connectedPrinterId]);
  
  const handleJetStop = useCallback(() => {
    jetStop();
    if (connectedPrinterId) startCountdown(connectedPrinterId, 'stopping', 106);
  }, [jetStop, startCountdown, connectedPrinterId]);

  // Build right panel content for desktop split-view (messages/editMessage screens)
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
      case 'network':
        return (
          <NetworkConfigScreen
            onHome={handleHome}
            isConnected={connectionState.isConnected}
            connectedPrinter={connectionState.connectedPrinter}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        );
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
        return <SetupScreen onHome={handleHome} onSendCommand={sendCommand} />;
      case 'service':
        return (
          <ServiceScreen
            metrics={connectionState.metrics}
            onHome={handleHome}
            onControl={() => setCurrentScreen('control')}
            onMount={() => setServiceScreenOpen(true)}
            onUnmount={() => setServiceScreenOpen(false)}
            onSendCommand={sendCommand}
          />
        );
      default:
        break;
    }
    
    // Default / home / desktop messages+editMessage: render PrintersScreen with optional right panel
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
        onDevSignOut={() => setIsDevSignedIn(false)}
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
      />
    );
  };

  return (
    <div className="min-h-dvh h-dvh overflow-hidden flex flex-col bg-background">
      <Header
        isConnected={connectionState.isConnected}
        connectedIp={connectionState.connectedPrinter?.ipAddress}
        onSettings={() => setCurrentScreen('network')}
        onHome={currentScreen !== 'home' ? handleHome : undefined}
        printerTime={connectionState.status?.printerTime}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {renderScreen()}
      </main>

      {/* BottomNav and Footer now rendered inside Dashboard/PrintersScreen right panel */}

      {/* Dev Panel - shown in dev mode OR when signed in with CITEC */}
      {(import.meta.env.DEV || isDevSignedIn) && (
        <DevPanel 
          isOpen={devPanelOpen} 
          onToggle={() => setDevPanelOpen(!devPanelOpen)}
          connectedPrinterIp={connectionState.connectedPrinter?.ipAddress}
          connectedPrinterPort={connectionState.connectedPrinter?.port}
        />
      )}
      
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
          if (password === 'CITEC') {
            setIsDevSignedIn(true);
            return true;
          }
          return false;
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
        onSendCommand={async (command: string) => {
          console.log('[AdjustDialog] Sending live command:', command);
          // Send command directly via the connection hook
          if (connectionState.isConnected && connectionState.connectedPrinter) {
            const printerId = connectionState.connectedPrinter.id;
            // Use emulator or electron API
            if (window.electronAPI) {
              const result = await window.electronAPI.printer.sendCommand(printerId, command);
              console.log('[AdjustDialog] Command result:', result);
            } else {
              // Emulator fallback handled in usePrinterConnection
              const { printerEmulator } = await import('@/lib/printerEmulator');
              if (printerEmulator.enabled) {
                const result = printerEmulator.processCommand(command);
                console.log('[AdjustDialog] Emulator result:', result);
              }
            }
          }
        }}
        isConnected={connectionState.isConnected}
      />

      {/* Help Dialog */}
      <HelpDialog
        open={helpDialogOpen}
        onOpenChange={setHelpDialogOpen}
        onSendCommand={sendCommand}
        isConnected={connectionState.isConnected}
      />
    </div>
  );
};

export default Index;
