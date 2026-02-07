import { useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav, NavItem } from '@/components/layout/BottomNav';
import { Dashboard } from '@/components/screens/Dashboard';
import { PrintersScreen } from '@/components/screens/PrintersScreen';
import { MessagesScreen } from '@/components/screens/MessagesScreen';
import { EditMessageScreen, MessageDetails } from '@/components/screens/EditMessageScreen';
import { AdjustScreen } from '@/components/screens/AdjustScreen';
import { SetupScreen } from '@/components/screens/SetupScreen';
import { ServiceScreen } from '@/components/screens/ServiceScreen';
import { CleanScreen } from '@/components/screens/CleanScreen';
import { NetworkConfigScreen } from '@/components/screens/NetworkConfigScreen';
import { SignInDialog } from '@/components/printers/SignInDialog';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';
import { useJetCountdown } from '@/hooks/useJetCountdown';
import { DevPanel } from '@/components/dev/DevPanel';
import { PrintMessage } from '@/types/printer';

// Only show dev panel in development mode
const isDev = import.meta.env.DEV;

type ScreenType = NavItem | 'network' | 'control' | 'editMessage';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PrintMessage | null>(null);
  // Store message content (fields) by message name
  const [messageContents, setMessageContents] = useState<Record<string, MessageDetails>>({});
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
    setServiceScreenOpen,
    setControlScreenOpen,
    addMessage,
    createMessageOnPrinter,
    saveMessageContent,
    updateMessage,
    deleteMessage,
  } = usePrinterConnection();
  
  const { countdownSeconds, countdownType, startCountdown, cancelCountdown } = useJetCountdown();

  const handleNavigate = (item: NavItem) => {
    setCurrentScreen(item);
  };

  const handleHome = () => {
    setCurrentScreen('home');
  };

  const handleTurnOff = () => {
    disconnect();
    setCurrentScreen('home');
  };

  const handleConnect = async (printer: typeof printers[0]) => {
    await connect(printer);
    // After connecting, go to the control/dashboard screen
    setCurrentScreen('control');
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
        return (
          <Dashboard
            status={connectionState.status}
            isConnected={connectionState.isConnected}
            onStart={handleStartPrint}
            onStop={stopPrint}
            onJetStop={handleJetStop}
            onNewMessage={() => setCurrentScreen('messages')}
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
            onHelp={() => {}}
            isSignedIn={isSignedIn}
            onMount={() => setControlScreenOpen(true)}
            onUnmount={() => setControlScreenOpen(false)}
            countdownSeconds={countdownSeconds}
            countdownType={countdownType}
          />
        );
      case 'editMessage':
        return editingMessage ? (
          <EditMessageScreen
            messageName={editingMessage.name}
            onSave={async (details: MessageDetails, isNew?: boolean) => {
              console.log('Save message:', details, 'isNew:', isNew);
              const targetName = isNew ? details.name : editingMessage.name;
              
              if (isNew) {
                // Save As - send ^NM command to create new message on printer
                console.log('Creating new message with name:', details.name);
                const success = await createMessageOnPrinter(details.name);
                if (!success) {
                  console.error('Failed to create message on printer');
                } else {
                  // Now save the field content
                  await saveMessageContent(details.name, details.fields);
                }
              } else {
                // Regular save - update existing message content
                console.log('Updating existing message:', editingMessage.name);
                await saveMessageContent(editingMessage.name, details.fields);
                updateMessage(editingMessage.id, details.name);
              }
              
              // Store message content locally for retrieval
              setMessageContents(prev => ({
                ...prev,
                [targetName]: details,
              }));
              
              setCurrentScreen('messages');
              setEditingMessage(null);
            }}
            onCancel={() => {
              setCurrentScreen('messages');
              setEditingMessage(null);
            }}
            onGetMessageDetails={async (name: string) => {
              // Return stored message details if available
              return messageContents[name] || null;
            }}
          />
        ) : null;
      case 'messages':
        return (
          <MessagesScreen
            messages={connectionState.messages}
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
            onNew={() => {
              // Create a new empty message and go to edit
              const newName = 'NEW_MSG';
              addMessage(newName);
              // Find the newly added message (will have highest ID)
              const newId = Math.max(0, ...connectionState.messages.map(m => m.id)) + 1;
              setEditingMessage({ id: newId, name: newName });
              setCurrentScreen('editMessage');
            }}
            onDelete={(message) => {
              console.log('Delete message:', message.name);
              deleteMessage(message.id);
            }}
            onHome={() => setCurrentScreen('control')}
          />
        );
      case 'adjust':
        return (
          <AdjustScreen
            settings={connectionState.settings}
            onUpdate={updateSettings}
            onSave={() => {}}
            onHome={handleHome}
          />
        );
      case 'clean':
        return <CleanScreen onHome={handleHome} />;
      case 'setup':
        return <SetupScreen onHome={handleHome} />;
      case 'service':
        return (
          <ServiceScreen
            metrics={connectionState.metrics}
            onHome={handleHome}
            onControl={() => setCurrentScreen('control')}
            onMount={() => setServiceScreenOpen(true)}
            onUnmount={() => setServiceScreenOpen(false)}
          />
        );
      default:
        // Home is now the Printers config screen
        return (
          <PrintersScreen
            printers={printers}
            onConnect={handleConnect}
            onHome={handleHome}
            onAddPrinter={addPrinter}
            onRemovePrinter={removePrinter}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        isConnected={connectionState.isConnected}
        connectedIp={connectionState.connectedPrinter?.ipAddress}
        onSettings={() => setCurrentScreen('network')}
        onHome={currentScreen !== 'home' ? handleHome : undefined}
        printerTime={connectionState.status?.printerTime}
      />

      <main className="flex-1 flex flex-col">
        {renderScreen()}
      </main>

      <BottomNav
        activeItem={['network', 'control', 'editMessage'].includes(currentScreen) ? 'home' : currentScreen as NavItem}
        onNavigate={handleNavigate}
        onTurnOff={handleTurnOff}
        showPrinterControls={currentScreen === 'control'}
      />

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground px-4 py-2 flex justify-between text-sm">
        <span>Build 1.0.0</span>
        <span>{connectionState.status?.printerVersion ?? ''}</span>
      </footer>

      {/* Dev Panel - only in development */}
      {isDev && (
        <DevPanel 
          isOpen={devPanelOpen} 
          onToggle={() => setDevPanelOpen(!devPanelOpen)} 
        />
      )}
      
      {/* Sign In Dialog */}
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
    </div>
  );
};

export default Index;
