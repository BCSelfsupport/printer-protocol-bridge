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
            onSave={(details: MessageDetails) => {
              console.log('Save message:', details);
              // TODO: Send ^CM, ^CF, ^MD commands to update message
              setCurrentScreen('messages');
              setEditingMessage(null);
            }}
            onCancel={() => {
              setCurrentScreen('messages');
              setEditingMessage(null);
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
              // TODO: Create new message flow
              console.log('New message');
            }}
            onDelete={(message) => {
              // TODO: Delete message with ^DM command
              console.log('Delete message:', message.name);
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
