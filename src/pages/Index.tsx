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
  const { saveMessage, getMessage } = useMessageStorage();
  
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
  
  const { countdownSeconds, countdownType, startCountdown, cancelCountdown } = useJetCountdown();

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
    disconnect();
    setCurrentScreen('home');
  };

  const isMobile = useIsMobile();
  
  const handleConnect = async (printer: typeof printers[0]) => {
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
    startCountdown('starting', 106); // 1:46 countdown
  }, [startPrint, startCountdown]);
  
  const handleJetStop = useCallback(() => {
    jetStop();
    startCountdown('stopping', 106); // 1:46 countdown for stopping too
  }, [jetStop, startCountdown]);

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
            onNewMessage={() => {
              setOpenNewDialogOnMount(true);
              setCurrentScreen('messages');
            }}
            onEditMessage={() => setCurrentScreen('messages')}
            onSignIn={async () => {
              if (isSignedIn) {
                // Sign out directly
                const success = await signOut();
                if (success) {
                  setIsSignedIn(false);
                }
              } else {
                // Show sign in dialog
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
        return editingMessage ? (
          <EditMessageScreen
            messageName={editingMessage.name}
            onSave={async (details: MessageDetails, isNew?: boolean) => {
              console.log('Save message:', details, 'isNew:', isNew);
              const targetName = isNew ? details.name : editingMessage.name;
              
              // Send full ^NM command with field subcommands to printer
              // For existing messages, saveMessageContent will ^DM first then ^NM
              console.log(isNew ? 'Creating new message:' : 'Updating message:', targetName);
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
              
              // Store message content locally for retrieval (persisted)
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
              // Return stored message details from local storage
              return getMessage(name);
            }}
          />
        ) : null;
      case 'messages':
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
              // Just create locally - ^NM with fields will be sent on Save
              addMessage(name);
              const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
              setEditingMessage({ id: newId, name });
              setCurrentScreen('editMessage');
            }}
            onDelete={(message) => {
              console.log('Delete message:', message.name);
              deleteMessage(message.id);
            }}
            onHome={() => setCurrentScreen('control')}
            openNewDialogOnMount={openNewDialogOnMount}
            onNewDialogOpened={() => setOpenNewDialogOnMount(false)}
          />
        );
      // 'adjust' is now handled as a dialog, not a screen
      // This case shouldn't be reached, but redirect to control just in case
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
        // Home is now the Printers config screen with split-view Dashboard on desktop
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
            // Dashboard props for split-view on desktop
            isConnected={connectionState.isConnected}
            connectedPrinter={connectionState.connectedPrinter}
            status={connectionState.status}
            onStart={handleStartPrint}
            onStop={stopPrint}
            onJetStop={handleJetStop}
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
          />
        );
    }
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
